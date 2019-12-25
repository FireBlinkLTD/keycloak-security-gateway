import { ServerResponse } from 'http';
import { sendJSONResponse } from '../utils/ResponseUtil';

const handler = async (res: ServerResponse) => {
    await sendJSONResponse(res, {
        ready: true,
        time: Date.now(),
    });
};

export default handler;
