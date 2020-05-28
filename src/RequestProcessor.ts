import { IncomingMessage, ServerResponse } from 'http';
import { createProxyServer } from 'http-proxy';
import { get } from 'config';
import { ITargetPathResult } from './interfaces';
import { JWT } from './models/JWT';
import { $log } from '@tsed/logger';
import * as ejs from 'ejs';
import { sendError, sendRedirect, setAuthCookies } from './utils/ResponseUtil';
import { extractAccessToken, extractRefreshToken, extractRequestPath } from './utils/RequestUtil';
import { findResourceByPathAndMethod } from './utils/ResourceUtils';

import handleHealthRoute from './routes/HealthRoute';
import handleLogoutRoute from './routes/LogoutRoute';
import handleRolesRoute from './routes/RolesRoute';
import handleAccessRoute from './routes/AccessRoute';

import { prepareAuthURL, verifyOnline, verifyOffline, handleCallbackRequest, refresh } from './utils/KeycloakUtil';

export class RequestProcessor {
    private proxy = createProxyServer();
    private upstreamURL: string = get('upstreamURL');
    private callbackPath: string = get('paths.callback');
    private logoutPath: string = get('paths.logout');
    private healthPath: string = get('paths.health');
    private accessPath: string = get('paths.access');
    private rolesPath: string = get('paths.roles');
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
     * Handle unauthorized flow
     * @param req
     * @param res
     * @param path
     * @param result
     */
    private async handleUnauthorizedFlow(
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
            await sendError(res, 401, 'Unauthorized');
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
            token = await this.handleUnauthorizedFlow(req, res, path, result);

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
            token = await this.handleUnauthorizedFlow(req, res, path, result);

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
            return await this.handleCallback(req, res);
        }

        if (path === this.logoutPath) {
            return await handleLogoutRoute(req, res);
        }

        if (path === this.healthPath) {
            return await handleHealthRoute(res);
        }

        if (path === this.rolesPath) {
            return await handleRolesRoute(req, res);
        }

        if (path === this.accessPath) {
            return await handleAccessRoute(req, res);
        }

        const result = findResourceByPathAndMethod(path, req.method);

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
}
