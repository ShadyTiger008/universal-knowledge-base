export interface CommunicationProvider {
  sendMessage(recipientId: string, text: string, token: string): Promise<void>;
}
