import { IncomingMessage, ServerResponse } from "http";
import {createProxyServer} from 'http-proxy';
import {get} from 'config';
import { IResourceDefinition, ITargetPathResult } from "./interfaces";
import { JWT } from "./models/JWT";
import {parse as cookieParse, serialize} from 'cookie';
import {$log} from "ts-log-debug";
import { prepareAuthURL, verifyOnline, verifyOffline, prepareLogoutURL, handleCallbackRequest } from "./utils/KeycloakUtil";

export class RequestProcessor {
    private proxy = createProxyServer();
    private upstreamURL: string = get('upstreamURL');
    private callbackPath: string = get('paths.callback');
    private logoutPath: string = get('paths.logout');
    private healthPath: string = get('paths.health');
    private cookieAccessToken: string = get('cookie.accessToken');
    private secureCookies: boolean = get('cookie.secure') === '1';
    private cookieRefreshToken: string = get('cookie.refreshToken');
    private resources: IResourceDefinition[] = JSON.parse(JSON.stringify(get('resources')));
    private jwtVerificationOnline = get('jwtVerification') === 'ONLINE';

    constructor() {
        this.proxy.on('error', (err) => {
            $log.error('Proxy error:', err);            
        })

        for (const resource of this.resources) {
            resource.matchPattern = new RegExp(resource.match, 'i');
        }

        if (this.upstreamURL[this.upstreamURL.length - 1] === '/') {
            this.upstreamURL = this.upstreamURL.substring(0, this.upstreamURL.length - 2);
        }                
    }

    private async sendError(res: ServerResponse, statusCode: number, description: string) {
        $log.warn('Sending error response:', statusCode, description);
        res.statusCode = statusCode;

        await new Promise((resolve, reject) => {
            res.write(description, (err) => {
                if (err) {
                    $log.warn('Unable to write response', err);
                    return reject(err);
                }

                res.end(() => {
                    resolve();
                });
            });
        });        
    }

    private async redirect(res: ServerResponse, url: string, statusCode = 307) {
        $log.debug('Redirecting to:', url);
        res.statusCode = statusCode;
        res.setHeader('Location', url);
        await new Promise(resolve => res.end(resolve));        
    }

    private async handleCallback(req: IncomingMessage, res: ServerResponse) {
        $log.debug('Handling oauth callback request', req.url);
        const response = await handleCallbackRequest(req.url);        
        res.setHeader(
            'Set-Cookie', 
            [
                serialize(this.cookieAccessToken, response.access_token, {
                    expires: new Date(Date.now() + response.expires_in * 1000 - 1000),
                    secure: this.secureCookies,
                    path: '/',
                }),

                serialize(this.cookieRefreshToken, response.refresh_token, {
                    expires: new Date(Date.now() + response.refresh_expires_in * 1000 - 1000),
                    secure: this.secureCookies,
                    path: '/',
                }),
            ]
        );        
        
        await this.redirect(res, response.redirectTo);        
    }

    private async handleLogout(req: IncomingMessage, res: ServerResponse) {
        $log.debug('Handling logout request');
        await this.redirect(res, prepareLogoutURL());
    }

    private async handleHealth(res: ServerResponse) {
        res.statusCode = 200;

        await new Promise((resolve, reject) => {
            res.write(JSON.stringify({
                ready: true
            }), (err) => {
                if (err) {
                    $log.warn('Unable to write response', err);
                    return reject(err);
                }

                res.end(() => {
                    resolve();
                });
            });
        }); 
    }

    private async handleVerificationFlow(req: IncomingMessage, res: ServerResponse, path: string, result: ITargetPathResult): Promise<JWT | null> {
        let token = this.extractJWTToken(req);
        
        if (!token) {
            if (result.resource.ssoFlow) {
                const authURL = prepareAuthURL(path);
                await this.redirect(res, authURL);
            } else {
                await this.sendError(res, 401, 'Unathorized');                    
            }

            return null;
        }

        let jwt: JWT;
        if (this.jwtVerificationOnline) {
            jwt = await verifyOnline(token);
        } else {
            jwt = await verifyOffline(token);
        }

        if (!jwt || jwt.isExpired()) {
            await this.sendError(res, 401, 'Unathorized');     
            
            return null;       
        }

        if (result.resource.roles) {
            if (!jwt.verifyRoles(result.resource.roles)) {
                await this.sendError(res, 403, 'Forbidden');
                
                return null;
            }
        }
        
        return jwt;
    }

    private async proxyRequest(req: IncomingMessage, res: ServerResponse, target: string, jwt: JWT) {
        $log.info('Proxy request to:', target);

        await new Promise((resolve, reject) => {
            this.proxy.web(req, res, { 
                target,
                ignorePath: true,
                headers: {
                    'X-Auth-Token': jwt.token,
                    'X-Auth-Roles': jwt.getAllRoles().join(','),
                    'X-Auth-Username': jwt.content.preferred_username,
                    'X-Auth-Email': jwt.content.email,                              
                }
            }, (err) => {
                if (err) {
                    return reject(err);
                }

                resolve();
            }); 
        })
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse) {
        const path = this.extractPath(req);
        $log.info(`New request received. method: ${req.method}; path: ${path}`);        

        if (path === this.callbackPath) {
            await this.handleCallback(req, res);
            return;
        }        

        if (path === this.logoutPath) {
            await this.handleLogout(req, res);
            return;
        }

        if (path === this.healthPath) {
            await this.handleHealth(res);
            return;
        }

        const result = this.findTargetPath(req, path);

        if (!result) {
            await this.sendError(res, 404, 'Not found');
            return;
        }
        
        let jwt;
        if (!result.resource.whitelisted) {
            jwt = await this.handleVerificationFlow(req, res, path, result);
            if (!jwt) {
                return;
            }
        }
                 
        
        let target = this.upstreamURL + result.path;
        const queryString = req.url.substring(path.length);
        if (queryString.length) {
            target += queryString;
        }

        await this.proxyRequest(req, res, target, jwt);        
    }
    
    /**
     * Process incomming request
     * @param req 
     * @param res 
     */
    process(req: IncomingMessage, res: ServerResponse) {
        this.handleRequest(req, res).catch(err => {
            $log.error('Unexpected error occurred', err);
            this.sendError(res, 500, 'Unexpected error');
        })
    }

    /**
     * Extract JWT token string from Authorization header or Cookie
     * @param req 
     */
    private extractJWTToken(req: IncomingMessage): string | null {
        $log.debug('Trying to extract JWT from request');
        let token: string;

        if (req.headers.authorization && req.headers.authorization.toLowerCase().indexOf('Bearer ') === 0) {
            token = req.headers.authorization.substring(7); // 'Bearer '.length
        }

        if (!token && req.headers.cookie) {
            if (req.headers.cookie.indexOf(this.cookieAccessToken) >= 0) {
                const cookies = cookieParse(req.headers.cookie);
                token = cookies[this.cookieAccessToken];
            }
        }
        
        $log.debug('JWT Token:', token);
        return token;
    }
    
    /**
     * Extract path string from incomming request
     * @param req 
     */
    private extractPath(req: IncomingMessage): string {
        return req.url.split('?')[0];
    }

    /**
     * Find target path
     * @param req 
     * @param path
     */
    private findTargetPath(req: IncomingMessage, path: string): ITargetPathResult | null {    
        $log.debug('Looking to find destination path');

        for (const resource of this.resources) {
            // first check if method is listed
            if (resource.methods && resource.methods.indexOf(req.method) < 0) {
                continue;
            }

            // try to match pattern
            if (!resource.matchPattern.exec(path)) {
                continue;
            }

            const result = {
                path,
                resource,
            }
                
            if (resource.override) {
                result.path = path.replace(resource.matchPattern, resource.override);
            } 

            $log.debug('Destination resource found', result);
            return result;  
        }

        $log.debug('Destination resource not found');
        return null;
    }
}