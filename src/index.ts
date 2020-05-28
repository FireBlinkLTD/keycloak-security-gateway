import { get } from 'config';
import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { RequestProcessor } from './RequestProcessor';
import { $log } from '@tsed/logger';

$log.level = get('log.level');

let server: Server;
const start = async () => {
    await new Promise((resolve) => {
        const requestProcessor = new RequestProcessor();
        server = createServer((req: IncomingMessage, res: ServerResponse) => {
            requestProcessor.process(req, res);
        });

        const port: number = get('port');
        const hostInterface: string = get('interface');

        server.listen(port, hostInterface, () => {
            $log.info(`Listening new requests on ${hostInterface}:${port}`);
            resolve();
        });
    });
};

const stop = async () => {
    await new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                return reject(err);
            }

            server = null;
            resolve();
        });
    });
};

if (process.env.NODE_ENV !== 'test') {
    start().catch((err) => {
        $log.error(err);
        process.exit(1);
    });
}

export { start, stop };
