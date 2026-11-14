import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { awsClient, awsNotification } from '../lib/aws-notification.mjs';

const requests = [];
let status = 200;
const client = awsClient('eu-west-1', {
  credentials: { accessKeyId: 'MOCK', secretAccessKey: 'mock-only' },
  requestHandler: {
    async handle(request) {
      requests.push([request.headers['x-amz-target'], JSON.parse(String(request.body))]);
      return { response: {
        statusCode: status, headers: { 'content-type': 'application/json' },
        body: Readable.from([JSON.stringify(status === 200 ? { MessageId: 'mock' } : { message: 'mock' })]),
      } };
    },
  },
});
const message = { number: '+491555555555', body: 'Achtung', identity: 'origin' };
assert.equal(await awsNotification(client, message), 'accepted');
assert.equal(await awsNotification(client, { ...message, voice: 'VICKI' }), 'accepted');
status = 503;
assert.equal(await awsNotification(client, message), 'unknown');
assert.equal(requests.length, 3);
const expected = { DestinationPhoneNumber: message.number, MessageBody: message.body, OriginationIdentity: message.identity };
assert.deepEqual(requests[0], ['PinpointSMSVoiceV2.SendTextMessage', { ...expected, MessageType: 'TRANSACTIONAL' }]);
assert.deepEqual(requests[1], ['PinpointSMSVoiceV2.SendVoiceMessage', { ...expected, VoiceId: 'VICKI', MessageBodyTextType: 'TEXT' }]);
client.destroy();
