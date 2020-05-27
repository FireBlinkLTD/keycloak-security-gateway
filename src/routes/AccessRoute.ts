import { ServerResponse, IncomingMessage } from 'http';
import { $log } from 'ts-log-debug';
import { extractAccessToken } from '../utils/RequestUtil';
import { sendError } from '../utils/ResponseUtil';
import { sendJSONResponse } from '../utils/ResponseUtil';
import { JWT } from '../models/JWT';
import { findResourceByPathAndMethod } from '../utils/ResourceUtils';
import { parse } from 'url';

const handler = async (req: IncomingMessage, res: ServerResponse) => {
    $log.debug('Handling logout request');
    const { path, method } = parse(req.url, true).query;

    if (!path) {
        return await sendError(res, 400, '"path" query parameter is missing');
    }

    if (!method) {
        return await sendError(res, 400, '"method" query parameter is missing');
    }

    const targetPath = findResourceByPathAndMethod(path.toString(), method.toString());

    if (!targetPath) {
        return await sendError(res, 404, 'Mapping not found');
    }

    if (!targetPath.resource.public) {
        const accessToken = extractAccessToken(req);

        if (!accessToken) {
            return await sendJSONResponse(res, {
                allowed: false,
            });
        }

        const jwtToken = new JWT(accessToken);
        if (targetPath.resource.roles) {
            if (!jwtToken.verifyRoles(targetPath.resource.roles)) {
                return await sendJSONResponse(res, {
                    allowed: false,
                });
            }
        }
    }

    return await sendJSONResponse(res, {
        allowed: true,
    });
};

export default handler;
