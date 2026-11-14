import { PinpointSMSVoiceV2Client, SendTextMessageCommand, SendVoiceMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';

export function awsClient(region, options = {}) {
  return new PinpointSMSVoiceV2Client({ ...options, region, maxAttempts: 1 });
}

/** @param {import('@aws-sdk/client-pinpoint-sms-voice-v2').PinpointSMSVoiceV2Client} client
 * @param {{number:string, body:string, identity:string, voice?:string}} message */
export async function awsNotification(client, { number, body, identity, voice }) {
  const target = { DestinationPhoneNumber: number, OriginationIdentity: identity, MessageBody: body };
  try {
    const response = await (voice
      ? client.send(new SendVoiceMessageCommand({ ...target, MessageBodyTextType: 'TEXT', VoiceId: voice }), { abortSignal: AbortSignal.timeout(12000) })
      : client.send(new SendTextMessageCommand({ ...target, MessageType: 'TRANSACTIONAL' }), { abortSignal: AbortSignal.timeout(12000) }));
    return response.MessageId ? 'accepted' : 'unknown';
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    return status >= 400 && status < 500 && status !== 408 ? 'rejected' : 'unknown';
  }
}
