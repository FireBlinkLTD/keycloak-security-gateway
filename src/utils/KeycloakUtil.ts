import { get } from 'config';
import * as jwt from 'jsonwebtoken';
import { JWT } from '../models/JWT';
import axios, { AxiosInstance } from 'axios';
import { getPublicKey } from './RSAPublicKeyUtil';
import { parse, stringify } from 'querystring';
import { ITokenResponse } from '../interfaces/ITokenResponse';
import { $log } from 'ts-log-debug';
import { IClientConfiguration } from '../interfaces/IClientConfiguration';

const host: string = get('host');
const callbackPath: string = get('paths.callback');
const logoutRedirectURL: string = get('logoutRedirectURL');
const scopes: string[] = get('keycloak.scopes') || [];
const clients: IClientConfiguration[] = get('keycloak.clients');

const certCache: {
    [publicRealmURL: string]: {
        [kid: string]: string;
    };
} = {};

const prepareRequest = (clientConfiguration: IClientConfiguration): AxiosInstance => {
    return axios.create({
        baseURL: clientConfiguration.realmURL.private,
    });
};

/**
 * Prepare Auth URL
 * @param clientConfiguration
 * @param path
 */
const prepareAuthURL = (clientConfiguration: IClientConfiguration, path: string): string => {
    const clientId = clientConfiguration.clientId || process.env[clientConfiguration.clientIdEnv];
    const redirectUri = [
        host,
        callbackPath,
        `?src=${encodeURIComponent(path)}`,
        `&clientId=${encodeURIComponent(clientId)}`,
    ].join('');

    const scope = ['openid', 'email', 'profile', ...scopes].join(' ');

    return [
        clientConfiguration.realmURL.public,
        '/protocol/openid-connect/auth',
        `?client_id=${encodeURIComponent(clientId)}`,
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
        '&response_type=code',
        `&scope=${encodeURIComponent(scope)}`,
    ].join('');
};

/**
 * Refresh access token
 * @param refreshToken
 */
const refresh = async (refreshToken: string): Promise<ITokenResponse> => {
    const clientId: string = new JWT(refreshToken).payload.azp;
    const clientConfiguration = clients.find((c) => {
        const cid = c.clientId || process.env[c.clientIdEnv];

        return cid === clientId;
    });

    if (!clientConfiguration) {
        throw new Error(`Unable to refresh token with clientId: ${clientId}. Client configuration not found.`);
    }

    const secret = clientConfiguration.secret || process.env[clientConfiguration.secretEnv];
    const request = prepareRequest(clientConfiguration);
    const result = await request('/protocol/openid-connect/token', {
        method: 'POST',
        data: stringify({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: secret,
        }),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    return result.data;
};

/**
 * Logout user
 * @param accessToken
 * @param refreshToken
 */
const logout = async (accessToken: string, refreshToken: string): Promise<void> => {
    const clientId: string = new JWT(accessToken).payload.azp;
    const clientConfiguration = clients.find((c) => {
        const cid = c.clientId || process.env[c.clientIdEnv];

        return cid === clientId;
    });

    if (!clientConfiguration) {
        throw new Error(
            `Unable to process logout for token with clientId: ${clientId}. Client configuration not found.`,
        );
    }

    const request = prepareRequest(clientConfiguration);
    await request('/protocol/openid-connect/logout', {
        method: 'POST',
        data: stringify({
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientConfiguration.secret,
        }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });
};

/**
 * Prepare post logout URL
 */
const preparePostLogoutURL = (): string => {
    let redirectTo = logoutRedirectURL;
    if (logoutRedirectURL.indexOf('/') === 0) {
        redirectTo = host + logoutRedirectURL;
    }

    return redirectTo;
};

/**
 * Handle authorization callback request
 * @param url
 */
const handleCallbackRequest = async (url: string): Promise<ITokenResponse> => {
    const queryString = url.substring(url.indexOf('?') + 1);
    const query = parse(queryString);
    const clientId = query.clientId.toString();

    const redirectUri = [
        host,
        callbackPath,
        `?src=${encodeURIComponent(query.src.toString())}`,
        `&clientId=${encodeURIComponent(clientId)}`,
    ].join('');

    const clientConfiguration = clients.find((c) => {
        const cid = c.clientId || process.env[c.clientIdEnv];

        return cid === clientId;
    });

    if (!clientConfiguration) {
        throw new Error(`Unable to callback request with clientId: ${clientId}. Client configuration not found.`);
    }

    const request = prepareRequest(clientConfiguration);
    const result = await request('/protocol/openid-connect/token', {
        method: 'POST',
        data: stringify({
            code: query.code,
            client_id: clientId,
            client_secret: clientConfiguration.secret,
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

    const clientId: string = jwtToken.payload.azp;
    const clientConfiguration = clients.find((c) => {
        const cid = c.clientId || process.env[c.clientIdEnv];

        return cid === clientId;
    });

    if (!clientConfiguration) {
        throw new Error(`Unable to verify JWT offline with clientId: ${clientId}. Client configuration not found.`);
    }

    const cert = await getPublicCert(clientConfiguration, jwtToken);

    return new Promise<JWT>((resolve, reject) => {
        jwt.verify(accessToken, cert, (err: any) => {
            if (err) {
                if (err.expiredAt) {
                    return resolve(null);
                }

                return reject(err);
            }

            resolve(jwtToken);
        });
    });
};

/**
 * Get public certificate from server to verify signature of a given JWT
 * @param clientConfiguration
 * @param jwtToken
 */
const getPublicCert = async (clientConfiguration: IClientConfiguration, jwtToken: JWT): Promise<string> => {
    $log.debug('Looking for public certificate...');

    if (
        certCache[clientConfiguration.realmURL.public] &&
        certCache[clientConfiguration.realmURL.public][jwtToken.header.kid]
    ) {
        $log.debug('Cache hit for public certificate...');

        return certCache[clientConfiguration.realmURL.public][jwtToken.header.kid];
    }

    const certs = await getCerts(clientConfiguration);
    const key = certs.keys.find((k: any) => k.kid === jwtToken.header.kid);

    // validate
    if (!key) {
        throw new Error(`Unable to retrieve public certificate for key: ${jwtToken.header.kid}`);
    }

    if (!key.n || !key.e || key.kty !== 'RSA' || key.alg !== 'RS256') {
        throw new Error('Cerfificate has invalid format.');
    }

    $log.debug('Processing key from the cert response...');

    if (!certCache[clientConfiguration.realmURL.public]) {
        certCache[clientConfiguration.realmURL.public] = {};
    }

    const cert = (certCache[clientConfiguration.realmURL.public][jwtToken.header.kid] = getPublicKey(key));

    return cert;
};

/**
 * Load opeind certificates from server
 * @param clientConfiguration
 */
const getCerts = async (clientConfiguration: IClientConfiguration): Promise<any> => {
    $log.debug('Load certificates from KeyCloak server...');
    const request = prepareRequest(clientConfiguration);
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

    const clientId: string = new JWT(accessToken).payload.azp;
    const clientConfiguration = clients.find((c) => {
        const cid = c.clientId || process.env[c.clientIdEnv];

        return cid === clientId;
    });

    if (!clientConfiguration) {
        throw new Error(`Unable to verify JWT online with clientId: ${clientId}. Client configuration not found.`);
    }

    try {
        const request = prepareRequest(clientConfiguration);
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

export { refresh, logout, prepareAuthURL, preparePostLogoutURL, verifyOffline, verifyOnline, handleCallbackRequest };
