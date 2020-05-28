import { ServerResponse, IncomingMessage } from 'http';
import { $log } from '@tsed/logger';
import { extractAccessToken, extractRefreshToken } from '../utils/RequestUtil';
import { logout, preparePostLogoutURL } from '../utils/KeycloakUtil';
import { parse } from 'querystring';
import { sendRedirect, setAuthCookies } from '../utils/ResponseUtil';

const handler = async (req: IncomingMessage, res: ServerResponse) => {
    $log.debug('Handling logout request');
    const accessToken = extractAccessToken(req);
    const refreshToken = extractRefreshToken(req);

    if (accessToken && refreshToken) {
        await logout(accessToken, refreshToken);
    }

    const expires = new Date(0);
    setAuthCookies(res, 'deleted', expires, 'deleted', expires);

    let redirectURL: string;
    if (req.url.indexOf('?')) {
        const query = parse(req.url.substring(req.url.indexOf('?') + 1));
        redirectURL = query.redirectTo && query.redirectTo.toString();
    }

    if (!redirectURL) {
        redirectURL = preparePostLogoutURL();
    }

    await sendRedirect(res, redirectURL);
};

export default handler;
