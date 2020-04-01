import { IncomingMessage, ServerResponse } from 'http';
import { createProxyServer } from 'http-proxy';
import { get } from 'config';
import { IResourceDefinition, ITargetPathResult } from './interfaces';
import { JWT } from './models/JWT';
import { $log } from 'ts-log-debug';
import * as ejs from 'ejs';
import { sendError, sendRedirect, setAuthCookies } from './utils/ResponseUtil';
import { extractAccessToken, extractRefreshToken, extractRequestPath } from './utils/RequestUtil';

import handleHealthRoute from './routes/HealthRoute';
import handleLogoutRoute from './routes/LogoutRoute';

import { prepareAuthURL, verifyOnline, verifyOffline, handleCallbackRequest, refresh } from './utils/KeycloakUtil';
import { IClientConfiguration } from './interfaces/IClientConfiguration';

export class RequestProcessor {
    private proxy = createProxyServer();
    private upstreamURL: string = get('upstreamURL');
    private callbackPath: string = get('paths.callback');
    private logoutPath: string = get('paths.logout');
    private healthPath: string = get('paths.health');
    private resources: IResourceDefinition[] = JSON.parse(JSON.stringify(get('resources')));
    private clientConfigurations: IClientConfiguration[] = get('keycloak.clients');
    private jwtVerificationOnline = get('jwtVerification') === 'ONLINE';
    private requestHeaders: Record<string, string> = get('request.headers');
    private responseHeaders: Record<string, string> = get('response.headers');

    constructor() {
        this.proxy.on('error', (err) => {
            $log.error('Proxy error:', err);
        });

        this.proxy.on('proxyRes', (proxyRes, req, res) => {
            for (const name of Object.keys(this.responseHeaders)) {
                delete proxyRes.headers[name.toLowerCase()];

                if (this.responseHeaders[name]) {
                    proxyRes.headers[name] = this.responseHeaders[name];
                } else {
                    res.removeHeader(name);
                }
            }
        });

        if (!this.resources) {
            this.resources = [
                {
                    match: '.*',
                },
            ];
        }

        for (const resource of this.resources) {
            if (resource.ssoFlow) {
                if (!resource.clientSID) {
                    throw new Error(
                        `"clientSID" is missing in resource definition that matches: "${resource.match}" and has ssoFlow enabled`,
                    );
                }
            }

            let match = resource.match;

            if (match.indexOf('^') !== 0) {
                match = '^' + match;
            }

            if (!match.endsWith('$')) {
                match = match + '$';
            }

            resource.matchPattern = new RegExp(match, 'i');
        }

        /* istanbul ignore else */
        if (this.upstreamURL[this.upstreamURL.length - 1] === '/') {
            this.upstreamURL = this.upstreamURL.substring(0, this.upstreamURL.length - 1);
        }
    }

    /**
     * Handle authorization callback request
     */
    private async handleCallback(req: IncomingMessage, res: ServerResponse) {
        $log.debug('Handling oauth callback request', req.url);
        const response = await handleCallbackRequest(req.url);

        const accessToken = response.access_token;
        const accessTokenExp = new Date(Date.now() + response.expires_in * 1000 - 1000);

        const refreshToken = response.refresh_token;
        const refreshTokenExp = new Date(Date.now() + response.refresh_expires_in * 1000 - 1000);

        setAuthCookies(res, accessToken, accessTokenExp, refreshToken, refreshTokenExp);

        await sendRedirect(res, response.redirectTo);
    }

    /**
     * Handle unathorized flow
     * @param req
     * @param res
     * @param path
     * @param result
     */
    private async handleUnathorizedFlow(
        req: IncomingMessage,
        res: ServerResponse,
        path: string,
        result: ITargetPathResult,
    ): Promise<string | null> {
        $log.debug('Handling unauthorized flow');

        const refreshToken = extractRefreshToken(req);

        if (refreshToken) {
            const jwtToken = new JWT(refreshToken);
            if (!jwtToken.isExpired()) {
                $log.debug('Found unexpired refresh token. Refreshing access one...');
                const refreshResponse = await refresh(refreshToken);

                const accessToken = refreshResponse.access_token;
                const accessTokenExp = new Date(Date.now() + refreshResponse.expires_in * 1000 - 1000);

                const newRefreshToken = refreshResponse.refresh_token;
                const refreshTokenExp = new Date(Date.now() + refreshResponse.refresh_expires_in * 1000 - 1000);

                setAuthCookies(res, accessToken, accessTokenExp, newRefreshToken, refreshTokenExp);

                return refreshResponse.access_token;
            }
        }

        if (result.resource.ssoFlow) {
            const authURL = prepareAuthURL(result.resource.clientConfiguration, path);
            await sendRedirect(res, authURL);
        } else {
            await sendError(res, 401, 'Unathorized');
        }

        return null;
    }

    /**
     * Handle JWT verification flow
     * @param req
     * @param res
     * @param path
     * @param result
     */
    private async handleVerificationFlow(
        req: IncomingMessage,
        res: ServerResponse,
        path: string,
        result: ITargetPathResult,
    ): Promise<JWT | null> {
        let token = extractAccessToken(req);
        let jwt: JWT;

        if (!token) {
            token = await this.handleUnathorizedFlow(req, res, path, result);

            if (!token) {
                return null;
            }

            jwt = new JWT(token);
        } else {
            if (this.jwtVerificationOnline) {
                jwt = await verifyOnline(token);
            } else {
                jwt = await verifyOffline(token);
            }
        }

        if (!jwt) {
            token = await this.handleUnathorizedFlow(req, res, path, result);

            if (!token) {
                return null;
            }

            jwt = new JWT(token);
        }

        if (result.resource.roles) {
            if (!jwt.verifyRoles(result.resource.roles)) {
                await sendError(res, 403, 'Forbidden');

                return null;
            }
        } else {
            $log.debug('Roles verification skipped');
        }

        return jwt;
    }

    /**
     * Handle the logic to proxy request to the upstream endpoint
     * Proxy also injects special headers for JWT fields and JWT itself
     */
    private async proxyRequest(req: IncomingMessage, res: ServerResponse, target: string, jwt: JWT | null) {
        $log.info('Proxy request to:', target);

        const headers: { [name: string]: string } = {};

        if (jwt) {
            headers['X-Auth-Token'] = jwt.token;

            const roles = jwt.getAllRoles();
            if (roles.length) {
                headers['X-Auth-Roles'] = roles.join(',');
            }

            if (jwt.payload.preferred_username) {
                headers['X-Auth-Username'] = jwt.payload.preferred_username;
            }

            if (jwt.payload.email) {
                headers['X-Auth-Email'] = jwt.payload.email;
            }
        }

        // add x- forward headers if original request missing them
        const xfwd = !req.headers['x-forwarded-for'];

        for (const header of Object.keys(this.requestHeaders)) {
            const value = this.requestHeaders[header];
            headers[header] = ejs.render(value, {
                jwt,
                req,
            });
        }

        await new Promise((resolve, reject) => {
            this.proxy.web(
                req,
                res,
                {
                    target,
                    ignorePath: true,
                    headers,
                    xfwd,
                },
                (err) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                },
            );
        });
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse) {
        const path = extractRequestPath(req);
        $log.info(`New request received. method: ${req.method}; path: ${path}`);

        if (path === this.callbackPath) {
            await this.handleCallback(req, res);

            return;
        }

        if (path === this.logoutPath) {
            await handleLogoutRoute(req, res);

            return;
        }

        if (path === this.healthPath) {
            await handleHealthRoute(res);

            return;
        }

        const result = this.findTargetPath(req, path);

        if (!result) {
            await sendError(res, 404, 'Not found');

            return;
        }

        let jwt;
        if (!result.resource.public) {
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
        this.handleRequest(req, res).catch((err) => {
            $log.error('Unexpected error occurred', err);
            sendError(res, 500, 'Unexpected error');
        });
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
            const match = resource.matchPattern.exec(path);
            if (!match) {
                continue;
            }

            const result = {
                path,
                resource: {
                    ...resource,
                },
            };

            if (resource.clientSID && resource.clientSID[0] === '$') {
                result.resource.clientSID = match[Number(resource.clientSID.substring(1))];
            }

            if (result.resource.clientSID) {
                result.resource.clientConfiguration = this.clientConfigurations.find(
                    (c) => c.sid === result.resource.clientSID,
                );
                if (!result.resource.clientConfiguration) {
                    throw new Error(
                        `Unable to find matching client configuration for clientSID "${result.resource.clientSID}" that matches: "${resource.match}" and has ssoFlow enabled`,
                    );
                }
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
