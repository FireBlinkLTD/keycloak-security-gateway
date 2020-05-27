import { IncomingMessage } from 'http';
import { ITargetPathResult, IResourceDefinition } from '../interfaces';
import { $log } from 'ts-log-debug';
import { get } from 'config';
import { IClientConfiguration } from '../interfaces/IClientConfiguration';

let resources: IResourceDefinition[] = JSON.parse(JSON.stringify(get('resources')));
const clientConfigurations: IClientConfiguration[] = get('keycloak.clients');

if (!resources) {
    resources = [
        {
            match: '.*',
        },
    ];
}

for (const resource of resources) {
    if (resource.ssoFlow) {
        if (!resource.clientSID) {
            throw new Error(
                `"clientSID" is missing in resource definition that matches: "${resource.match}" and has ssoFlow enabled`,
            );
        }
    }

    if (resource.methods) {
        resource.methods = resource.methods.map((m) => m.toUpperCase());
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

/**
 * Find target resource
 * @param path
 * @param method
 */
const findResourceByPathAndMethod = (path: string, method: string): ITargetPathResult | null => {
    $log.debug('Looking to find destination path');

    for (const resource of resources) {
        // first check if method is listed
        if (resource.methods && resource.methods.indexOf(method || method) < 0) {
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
            result.resource.clientConfiguration = clientConfigurations.find((c) => c.sid === result.resource.clientSID);
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
};

export { findResourceByPathAndMethod };
