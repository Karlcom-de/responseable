import type { PinpointSMSVoiceV2Client, PinpointSMSVoiceV2ClientConfig } from '@aws-sdk/client-pinpoint-sms-voice-v2';

export function awsClient(region: string, options?: PinpointSMSVoiceV2ClientConfig): PinpointSMSVoiceV2Client;
export function awsNotification(client: PinpointSMSVoiceV2Client, message: {
  number: string; body: string; identity: string; voice?: string;
}): Promise<'accepted' | 'rejected' | 'unknown'>;
