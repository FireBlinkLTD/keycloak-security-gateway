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
    const { resource } = parse(req.url, true).query;

    if (!resource) {
        return await sendError(res, 400, '"resource" query parameter is missing');
    }

    const resources: string[] = Array.isArray(resource) ? resource : resource.toString().split(',');

    const accessToken = extractAccessToken(req);
    let jwt: JWT = null;
    if (accessToken) {
        jwt = new JWT(accessToken);
    }

    const result: { [key: string]: boolean } = {};
    for (const r of resources) {
        const chunks = r.split(':');
        if (chunks.length !== 2) {
            return await sendError(res, 400, '"resource" query parameter has invalid format');
        }

        result[r] = isAllowed(chunks[1], chunks[0], jwt);
    }

    return await sendJSONResponse(res, result);
};

const isAllowed = (path: string, method: string, jwt?: JWT): boolean => {
    const targetPath = findResourceByPathAndMethod(path, method);

    if (!targetPath) {
        $log.warn(`Unable to verify is client can access ${method} ${path}`);

        return false;
    }

    if (!targetPath.resource.public) {
        if (!jwt) {
            return false;
        }

        if (targetPath.resource.roles) {
            if (!jwt.verifyRoles(targetPath.resource.roles)) {
                return false;
            }
        }
    }

    return true;
};

export default handler;
