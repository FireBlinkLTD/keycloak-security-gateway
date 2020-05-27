import { suite, test } from 'mocha-typescript';
import { get } from 'config';
import axios from 'axios';
import { deepStrictEqual } from 'assert';
import { start, stop } from '../../../src';
import { BaseSuite } from '../BaseSuite';

@suite()
class AccessRoute extends BaseSuite {
    async before() {
        await start();
    }

    async after() {
        await stop();
    }

    @test()
    async authorizedOne() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get(get('paths.access'), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                resource: 'GET:/api',
            },
        });

        deepStrictEqual(response.data, {
            ['GET:/api']: true,
        });
    }

    @test()
    async authorizedMany() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get(get('paths.access'), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                resource: 'GET:/api,GET:/api/roles/all',
            },
        });

        deepStrictEqual(response.data, {
            ['GET:/api']: true,
            ['GET:/api/roles/all']: false,
        });
    }

    @test()
    async publicResource() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const response = await request.get(get('paths.access'), {
            params: {
                resource: 'GET:/public',
            },
        });

        deepStrictEqual(response.data, {
            ['GET:/public']: true,
        });
    }
}
