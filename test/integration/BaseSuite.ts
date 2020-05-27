import { get } from 'config';
import axios from 'axios';
import { stringify } from 'querystring';
import { IClientConfiguration } from '../../src/interfaces/IClientConfiguration';

const clients: IClientConfiguration[] = get('keycloak.clients');

export abstract class BaseSuite {
    /**
     * Authenticate with service account
     */
    protected async getAccessToken(): Promise<string> {
        console.log('-> Retrieving access_token from KC...');
        const request = axios.create({
            baseURL: clients[0].realmURL.private,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const result = await request('/protocol/openid-connect/token', {
            method: 'POST',
            data: stringify({
                grant_type: 'client_credentials',
                client_id: 'test',
                client_secret: clients[0].secret,
            }),
        });

        console.log(`-> Access token: ${result.data.access_token}`);

        return result.data.access_token;
    }
}
