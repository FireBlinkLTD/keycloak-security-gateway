import { ServerResponse, IncomingMessage } from 'http';
import { $log } from 'ts-log-debug';
import { extractAccessToken } from '../utils/RequestUtil';
import { sendError } from '../utils/ResponseUtil';
import { sendJSONResponse } from '../utils/ResponseUtil';
import { JWT } from '../models/JWT';

const handler = async (req: IncomingMessage, res: ServerResponse) => {
    $log.debug('Handling logout request');
    const accessToken = extractAccessToken(req);

    if (!accessToken) {
        await sendError(res, 401, 'Unauthorized');

        return;
    }

    const jwtToken = new JWT(accessToken);

    await sendJSONResponse(res, jwtToken.getAllRoles());
};

export default handler;
