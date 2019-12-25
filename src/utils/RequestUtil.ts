import { $log } from 'ts-log-debug';
import { IncomingMessage } from 'http';
import { parse } from 'cookie';
import { get } from 'config';

const cookieAccessToken: string = get('cookie.accessToken');
const cookieRefreshToken: string = get('cookie.refreshToken');

/**
 * Extract JWT token string from Authorization header or Cookie
 * @param req
 */
const extractAccessToken = (req: IncomingMessage): string | null => {
    $log.debug('Trying to extract JWT from request');
    let token: string | null = null;

    if (req.headers.authorization && req.headers.authorization.toLowerCase().indexOf('bearer ') === 0) {
        token = req.headers.authorization.substring(7); // 'Bearer '.length
    }

    if (!token && req.headers.cookie) {
        if (req.headers.cookie.indexOf(cookieAccessToken) >= 0) {
            const cookies = parse(req.headers.cookie);
            token = cookies[cookieAccessToken];
        }
    }

    $log.debug('Access Token:', token);

    return token;
};

/**
 * Extract JWT token string from Authorization header or Cookie
 * @param req
 */
const extractRefreshToken = (req: IncomingMessage): string | null => {
    $log.debug('Trying to extract refresh token from request');
    let token: string | null = null;
    if (req.headers.cookie && req.headers.cookie.indexOf(cookieRefreshToken) >= 0) {
        const cookies = parse(req.headers.cookie);
        token = cookies[cookieRefreshToken];
    }
    $log.debug('Refresh Token:', token);

    return token;
};

/**
 * Extract path string from incomming request
 * @param req
 */
const extractRequestPath = (req: IncomingMessage): string => {
    return req.url.split('?')[0];
};

export { extractAccessToken, extractRefreshToken, extractRequestPath };
