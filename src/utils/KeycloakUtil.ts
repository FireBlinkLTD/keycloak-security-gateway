import { get } from 'config';
import * as jwt from 'jsonwebtoken';
import { JWT } from '../models/JWT';
import axios from 'axios';
import { getPublicKey } from './RSAPublicKeyUtil';
import { parse, stringify } from 'querystring';
import { ITokenResponse } from '../interfaces/ITokenResponse';
import { $log } from 'ts-log-debug';

const host: string = get('host');
const callbackPath: string = get('paths.callback');
const logoutRedirectURL: string = get('logoutRedirectURL');
const scopes: string[] = get('keycloak.scopes') || [];
const publicRealmURL: string = get('keycloak.realmURL.public');
const privateRealmURL: string = get('keycloak.realmURL.private');
const clientId: string = get('keycloak.clientId');
const clientSecret: string = get('keycloak.clientSecret');

const request = axios.create({
    baseURL: privateRealmURL,
});

const certCache: { [kid: string]: string } = {};

/**
 * Prepare Auth URL
 * @param path
 */
const prepareAuthURL = (path: string): string => {
    const redirectUri = [host, callbackPath, `?src=${encodeURIComponent(path)}`].join('');

    const scope = ['openid', 'email', 'profile', ...scopes].join('+');

    return [
        publicRealmURL,
        '/protocol/openid-connect/auth',
        `?client_id=${encodeURIComponent(clientId)}`,
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
        '&response_type=code',
        `&scope=${scope}`,
    ].join('');
};

const logout = async (accessToken: string, refreshToken: string): Promise<void> => {
    await request('/protocol/openid-connect/logout', {
        method: 'POST',
        data: stringify({
            refresh_token: refreshToken,
            client_id: clientId,
        }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
};

const prepareLogoutURL = (): string => {
    let redirectTo = logoutRedirectURL;
    if (logoutRedirectURL.indexOf('/') === 0) {
        redirectTo = host + logoutRedirectURL;
    }

    return redirectTo;
};

const handleCallbackRequest = async (url: string): Promise<ITokenResponse> => {
    const queryString = url.substring(url.indexOf('?') + 1);
    const query = parse(queryString);

    const redirectUri = [host, callbackPath, `?src=${encodeURIComponent(query.src.toString())}`].join('');

    const result = await request('/protocol/openid-connect/token', {
        method: 'POST',
        data: stringify({
            code: query.code,
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    const response = <ITokenResponse>result.data;
    response.redirectTo = host + query.src;

    return response;
};

/**
 * Verify access token offline
 * @param accessToken
 */
const verifyOffline = async (accessToken: string): Promise<JWT | null> => {
    $log.debug('Verifying JWT token offline');
    const jwtToken = new JWT(accessToken);
    const cert = await getPublicCert(jwtToken);

    return new Promise<JWT>((resolve, reject) => {
        jwt.verify(accessToken, cert, (err: any) => {
            if (err) {
                return reject(err);
            }

            if (jwtToken.isExpired()) {
                return resolve(null);
            }

            resolve(jwtToken);
        });
    });
};

const getPublicCert = async (jwtToken: JWT): Promise<string> => {
    $log.debug('Looking for public certificate...');

    if (certCache[jwtToken.header.kid]) {
        $log.debug('Cache hit for public certificate...');

        return certCache[jwtToken.header.kid];
    }

    const certs = await getCerts();
    const key = certs.keys.find((k: any) => k.kid === jwtToken.header.kid);

    // validate
    if (!key || !key.n || !key.e || key.kty !== 'RSA' || key.alg !== 'RS256') {
        throw new Error('Missing or invalid key format.');
    }

    $log.debug('Processing key from the cert response...');

    return (certCache[jwtToken.header.kid] = getPublicKey(key));
};

const getCerts = async (): Promise<any> => {
    $log.debug('Load certificates from KeyCloak server...');
    const response = await request.get(`/protocol/openid-connect/certs`);

    return response.data;
};

/**
 * Verify token online
 * @param accessToken
 */
const verifyOnline = async (accessToken: string): Promise<JWT | null> => {
    $log.debug('Verifying JWT token online');
    const jwtToken = new JWT(accessToken);

    try {
        await request.get('/protocol/openid-connect/userinfo', {
            headers: {
                Authorization: 'Bearer ' + accessToken,
            },
        });
    } catch (e) {
        if ((e.response && e.response.status === 401) || e.response.status === 401) {
            return null;
        }

        throw e;
    }

    return jwtToken;
};

export { logout, prepareAuthURL, prepareLogoutURL, verifyOffline, verifyOnline, handleCallbackRequest };
