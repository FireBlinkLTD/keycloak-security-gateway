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
    async allowedResource() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get(get('paths.access'), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                path: '/api',
                method: 'GET',
            },
        });

        deepStrictEqual(response.data, {
            allowed: true,
        });
    }

    @test()
    async forbiddenResource() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const accessToken = await this.getAccessToken();

        const response = await request.get(get('paths.access'), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                path: '/api/roles/all',
                method: 'GET',
            },
        });

        deepStrictEqual(response.data, {
            allowed: false,
        });
    }

    @test()
    async publicResource() {
        const request = axios.create({
            baseURL: get('host'),
        });

        const response = await request.get(get('paths.access'), {
            params: {
                path: '/public',
                method: 'GET',
            },
        });

        deepStrictEqual(response.data, {
            allowed: true,
        });
    }
}
