import type {
  BotCommandScopeAllChatAdministrators,
  BotCommandScopeAllGroupChats,
  BotCommandScopeAllPrivateChats,
  BotCommandScopeChat,
  BotCommandScopeChatMember,
} from '@grammyjs/types/settings'

const privateScope: BotCommandScopeAllPrivateChats = {
  type: 'all_private_chats',
}
const groupScope: BotCommandScopeAllGroupChats = { type: 'all_group_chats' }
const chatAdminsScope: BotCommandScopeAllChatAdministrators = {
  type: 'all_chat_administrators',
}
const chatScope = (id: number | string): BotCommandScopeChat => ({
  type: 'chat',
  chat_id: id,
})
const chatMemberScope = (
  chat: number | string,
  user: number,
): BotCommandScopeChatMember => ({
  type: 'chat_member',
  chat_id: chat,
  user_id: user,
})

export const commandScopes = {
  private: privateScope,
  group: groupScope,
  chatAdmins: chatAdminsScope,
  chat: chatScope,
  chatMember: chatMemberScope,
}
