import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { db, requireUser, throwDb, profileMap } from "./shared";
import { getAdminSupabase } from "../config/database";
import { MEDIA_BUCKET } from "../config/storage";
import { AppError } from "../utils/app-error";
import { assertUsersNotBlocked } from "./blocks.service";

async function assertMember(client: any, conversationId: string, userId: string) {
  const { data, error } = await client.from("conversation_members").select("user_id").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
  if (error) throwDb(error);
  if (!data) throw new AppError(403, "NOT_CONVERSATION_MEMBER", "You cannot access this conversation.");
  const { data: others, error: membersError } = await getAdminSupabase().from("conversation_members").select("user_id").eq("conversation_id", conversationId).neq("user_id", userId).is("left_at", null);
  if (membersError) throwDb(membersError);
  for (const other of others || []) await assertUsersNotBlocked(userId, String((other as any).user_id));
}

export async function createConversation(req: Express.Request, username: string) {
  const user = requireUser(req);
  const client = getAdminSupabase();
  const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();
  const { data: target, error: targetError } = await client.from("profiles").select("id,username,message_privacy").eq("username", cleanUsername).maybeSingle();
  if (targetError) throwDb(targetError);
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "That user could not be found.");
  if (target.id === user.id) throw new AppError(400, "CANNOT_MESSAGE_SELF", "You cannot start a conversation with yourself.");
  await assertUsersNotBlocked(user.id, target.id);
  const messagePrivacy = String((target as any).message_privacy || "everyone");
  if (messagePrivacy === "nobody") throw new AppError(403, "MESSAGING_DISABLED", "This user is not accepting new messages.");
  if (messagePrivacy === "followers") {
    const { data: follows, error: followError } = await client.from("follows").select("follower_id").eq("follower_id", user.id).eq("followed_id", target.id).maybeSingle();
    if (followError) throwDb(followError);
    if (!follows) throw new AppError(403, "MESSAGING_FOLLOWERS_ONLY", "Follow this user before starting a conversation.");
  }

  const { data: ownMemberships, error: ownError } = await client.from("conversation_members").select("conversation_id").eq("user_id", user.id);
  if (ownError) throwDb(ownError);
  const ownIds = (ownMemberships || []).map((item: any) => item.conversation_id);
  if (ownIds.length) {
    const { data: directConversations, error: directError } = await client.from("conversations").select("id").in("id", ownIds).eq("kind", "direct");
    if (directError) throwDb(directError);
    const directIds = (directConversations || []).map((x: any) => x.id);
    if (directIds.length) {
      const { data: targetMembership, error } = await client.from("conversation_members").select("conversation_id").eq("user_id", target.id).in("conversation_id", directIds).limit(1).maybeSingle();
      if (error) throwDb(error);
      if (targetMembership) return { id: targetMembership.conversation_id };
    }
  }

  const { data: conversation, error: conversationError } = await client.from("conversations").insert({ created_at: new Date().toISOString() }).select("id").single();
  if (conversationError) throwDb(conversationError);
  const { error: membersError } = await client.from("conversation_members").insert([
    { conversation_id: conversation.id, user_id: user.id },
    { conversation_id: conversation.id, user_id: target.id },
  ]);
  if (membersError) {
    await client.from("conversations").delete().eq("id", conversation.id);
    throwDb(membersError);
  }
  return { id: conversation.id };
}

export async function conversations(req: Express.Request) {
  const user = requireUser(req), admin = getAdminSupabase();
  const { data: ownMemberships, error } = await admin.from("conversation_members").select("conversation_id,role,cleared_at,left_at").eq("user_id", user.id).is("left_at", null);
  if (error) throwDb(error);
  const ownRows = ownMemberships || [], ids = ownRows.map((item: any) => item.conversation_id);
  if (!ids.length) return { items: [] };
  const [{ data: convs, error: convError }, { data: allMembers, error: memberError }, { data: messages, error: messageError }] = await Promise.all([
    admin.from("conversations").select("id,kind,name,created_by,created_at").in("id", ids),
    admin.from("conversation_members").select("conversation_id,user_id,role,joined_at,left_at").in("conversation_id", ids).is("left_at", null),
    admin.from("messages").select("conversation_id,body,created_at,sender_id,message_type,attachment_name,deleted_for_everyone_at").in("conversation_id", ids).order("created_at", { ascending: false }),
  ]);
  if (convError) throwDb(convError); if (memberError) throwDb(memberError); if (messageError) throwDb(messageError);
  const memberRows = allMembers || [];
  const profileIds = [...new Set<string>(memberRows.map((x: any) => String(x.user_id)))];
  const profiles = await profileMap(admin, profileIds);
  const latest = new Map<string, any>();
  for (const msg of messages || []) {
    const ownMembership: any = ownRows.find((x: any) => x.conversation_id === msg.conversation_id);
    if (ownMembership?.cleared_at && new Date(msg.created_at).getTime() <= new Date(ownMembership.cleared_at).getTime()) continue;
    if (!latest.has(msg.conversation_id)) latest.set(msg.conversation_id, msg);
  }
  return { items: (convs || []).map((conv: any) => {
    const mine: any = ownRows.find((x: any) => x.conversation_id === conv.id) || {};
    const members = memberRows.filter((x: any) => x.conversation_id === conv.id);
    const other: any = members.find((x: any) => x.user_id !== user.id) || {};
    const profile: any = profiles.get(other.user_id) || {};
    const last = latest.get(conv.id);
    const group = conv.kind === "group";
    return { id: conv.id, kind: conv.kind || "direct", name: conv.name || null, createdBy: conv.created_by || null, role: mine.role || "member", memberCount: members.length, participantId: other.user_id || null, title: group ? (conv.name || "Group chat") : (profile.display_name || profile.username || "Conversation"), username: profile.username || "", displayName: group ? (conv.name || "Group chat") : (profile.display_name || profile.username || "Conversation"), avatarUrl: profile.avatar_url || null, lastMessage: last ? (last.deleted_for_everyone_at ? "This message was unsent" : last.body || (last.attachment_name ? `📎 ${last.attachment_name}` : "Attachment")) : "No messages yet", lastMessageAt: last?.created_at || null };
  }).sort((a: any, b: any) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "")) };
}

export async function listMessages(req: Express.Request, id: string) {
  const user = requireUser(req);
  const c = db(req);
  await assertMember(c, id, user.id);
  const admin = getAdminSupabase();
  const membership = await memberRow(id, user.id);
  let query = admin.from("messages").select("id,conversation_id,sender_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size_bytes,deleted_for_everyone_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(100);
  if (membership.cleared_at) query = query.gt("created_at", membership.cleared_at);
  const { data, error } = await query;
  if (error) throwDb(error);
  const allRows = data || [];
  const allIds = allRows.map((item: any) => item.id);
  const { data: hiddenRows, error: hiddenError } = allIds.length ? await admin.from("hidden_messages").select("message_id").eq("user_id", user.id).in("message_id", allIds) : { data: [], error: null };
  if (hiddenError) throwDb(hiddenError);
  const hiddenIds = new Set<string>((hiddenRows || []).map((item: any) => String(item.message_id)));
  const rows = allRows.filter((item: any) => !hiddenIds.has(String(item.id)));
  const ids = rows.map((item: any) => item.id);
  const now = new Date().toISOString();
  const receiptRows = rows.filter((item: any) => item.sender_id !== user.id).map((item: any) => ({ message_id: item.id, user_id: user.id, delivered_at: now, read_at: now }));
  if (receiptRows.length) { const { error: receiptWriteError } = await admin.from("message_receipts").upsert(receiptRows, { onConflict: "message_id,user_id" }); if (receiptWriteError) throwDb(receiptWriteError); }
  const [{ data: reactions, error: reactionError }, { data: receipts, error: receiptError }] = await Promise.all([
    ids.length ? admin.from("message_reactions").select("message_id,user_id,emoji").in("message_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from("message_receipts").select("message_id,user_id,delivered_at,read_at").in("message_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reactionError) throwDb(reactionError); if (receiptError) throwDb(receiptError);
  const items = await Promise.all(rows.map(async (item: any) => {
    let attachmentUrl: string | null = null;
    if (item.attachment_path && !item.deleted_for_everyone_at) { const { data: signed } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(item.attachment_path, 3600); attachmentUrl = signed?.signedUrl || null; }
    return { id: item.id, conversationId: item.conversation_id, senderId: item.sender_id, body: item.deleted_for_everyone_at ? "This message was unsent" : item.body, createdAt: item.created_at, messageType: item.deleted_for_everyone_at ? "system" : item.message_type || "text", attachmentName: item.deleted_for_everyone_at ? null : item.attachment_name, attachmentMimeType: item.attachment_mime_type, attachmentSizeBytes: item.attachment_size_bytes, attachmentUrl, deletedForEveryone: Boolean(item.deleted_for_everyone_at), reactions: (reactions || []).filter((r: any) => r.message_id === item.id).map((r: any) => ({ userId: r.user_id, emoji: r.emoji })), receipts: (receipts || []).filter((r: any) => r.message_id === item.id).map((r: any) => ({ userId: r.user_id, deliveredAt: r.delivered_at, readAt: r.read_at })) };
  }));
  return { items, nextCursor: null };
}

export async function sendMessage(req: Express.Request, id: string, body: string) {
  const user = requireUser(req);
  const c = db(req);
  await assertMember(c, id, user.id);
  await memberRow(id, user.id);
  const cleanBody = body.trim();
  if (!cleanBody) throw new AppError(400, "MESSAGE_REQUIRED", "Write a message before sending.");
  const { data, error } = await getAdminSupabase().from("messages").insert({ conversation_id: id, sender_id: user.id, body: cleanBody }).select().single();
  if (error) throwDb(error);
  try {
    const admin = getAdminSupabase();
    const { data: activeMembers } = await admin.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", user.id).is("left_at", null);
    if (activeMembers?.length) await admin.from("message_receipts").upsert(activeMembers.map((member: any) => ({ message_id: data.id, user_id: member.user_id })), { onConflict: "message_id,user_id" });
    const [{ data: recipients }, { data: senderProfile }] = await Promise.all([
      admin.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", user.id).is("left_at", null),
      c.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    ]);
    if (recipients?.length) await admin.from("notifications").insert(recipients.map((recipient: any) => ({ user_id: recipient.user_id, actor_id: user.id, type: "message", message: `New message from @${senderProfile?.username || "someone"}.` })));
  } catch { /* Message delivery must not depend on notification delivery. */ }
  return { id: data.id, conversationId: data.conversation_id, senderId: data.sender_id, body: data.body, createdAt: data.created_at };
}

async function memberRow(conversationId: string, userId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.from("conversation_members").select("user_id,role,left_at,cleared_at").eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
  if (error) throwDb(error);
  if (!data || (data as any).left_at) throw new AppError(403, "NOT_CONVERSATION_MEMBER", "You cannot access this conversation.");
  return data as any;
}

export async function createGroup(req: Express.Request, name: string, usernames: string[]) {
  const user = requireUser(req), admin = getAdminSupabase();
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new AppError(400, "GROUP_NAME_REQUIRED", "Enter a group name.");
  const normalized = [...new Set(usernames.map(x => x.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))].slice(0, 99);
  if (!normalized.length) throw new AppError(400, "GROUP_MEMBERS_REQUIRED", "Add at least one other member to create a group.");
  const { data: profiles, error: profileError } = await admin.from("profiles").select("id,username").in("username", normalized);
  if (profileError) throwDb(profileError);
  if (normalized.length !== (profiles || []).length) throw new AppError(400, "GROUP_MEMBER_NOT_FOUND", "One or more usernames were not found.");
  if (!(profiles || []).some((p: any) => p.id !== user.id)) throw new AppError(400, "GROUP_MEMBERS_REQUIRED", "Add at least one other member to create a group.");
  for (const p of profiles || []) { if (p.id === user.id) continue; await assertUsersNotBlocked(user.id, p.id); }
  const { data: conv, error } = await admin.from("conversations").insert({ kind: "group", name: cleanName, created_by: user.id }).select("id").single();
  if (error) throwDb(error);
  const members = [{ conversation_id: conv.id, user_id: user.id, role: "admin" }, ...(profiles || []).filter((p: any) => p.id !== user.id).map((p: any) => ({ conversation_id: conv.id, user_id: p.id, role: "member" }))];
  const { error: memberError } = await admin.from("conversation_members").insert(members);
  if (memberError) { await admin.from("conversations").delete().eq("id", conv.id); throwDb(memberError); }
  try { const recipients = members.filter((m: any) => m.user_id !== user.id); if (recipients.length) await admin.from("notifications").insert(recipients.map((m: any) => ({ user_id: m.user_id, actor_id: user.id, type: "group_added", message: `You were added to the group “${cleanName}”.` }))); } catch {}
  return { id: conv.id };
}

export async function addGroupMember(req: Express.Request, id: string, username: string) {
  const user = requireUser(req), admin = getAdminSupabase();
  const own = await memberRow(id, user.id);
  if (own.role !== "admin") throw new AppError(403, "GROUP_ADMIN_REQUIRED", "Only group admins can add members.");
  const { data: target, error } = await admin.from("profiles").select("id,username").eq("username", username.trim().replace(/^@/, "").toLowerCase()).maybeSingle();
  if (error) throwDb(error); if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (target.id === user.id) throw new AppError(400, "ALREADY_GROUP_MEMBER", "You are already a member of this group.");
  await assertUsersNotBlocked(user.id, target.id);
  const { data: existingMember, error: existingError } = await admin.from("conversation_members").select("user_id,left_at").eq("conversation_id", id).eq("user_id", target.id).maybeSingle();
  if (existingError) throwDb(existingError);
  if (existingMember && !(existingMember as any).left_at) throw new AppError(409, "ALREADY_GROUP_MEMBER", "That user is already in this group.");
  const { error: insertError } = await admin.from("conversation_members").upsert({ conversation_id: id, user_id: target.id, role: "member", joined_at: new Date().toISOString(), left_at: null, cleared_at: null }, { onConflict: "conversation_id,user_id" });
  if (insertError) throwDb(insertError);
  try { await admin.from("notifications").insert({ user_id: target.id, actor_id: user.id, type: "group_added", message: `You were added to a VYBE group.` }); } catch {}
  return { added: true, username: target.username };
}

export async function deleteGroup(req: Express.Request, id: string) {
  const user = requireUser(req), admin = getAdminSupabase();
  const own = await memberRow(id, user.id);
  const { data: conv, error } = await admin.from("conversations").select("kind,created_by").eq("id", id).single();
  if (error) throwDb(error); if (conv.kind !== "group") throw new AppError(400, "NOT_A_GROUP", "This conversation is not a group.");
  if (own.role !== "admin") throw new AppError(403, "GROUP_ADMIN_REQUIRED", "Only a group admin can delete this group.");
  const { error: deleteError } = await admin.from("conversations").delete().eq("id", id); if (deleteError) throwDb(deleteError);
  return { deleted: true };
}

export async function clearHistory(req: Express.Request, id: string) {
  const user = requireUser(req), admin = getAdminSupabase();
  const own = await memberRow(id, user.id);
  const { data: conv, error } = await admin.from("conversations").select("kind").eq("id", id).single(); if (error) throwDb(error);
  if (conv.kind === "group" && own.role !== "admin") throw new AppError(403, "GROUP_ADMIN_REQUIRED", "Only a group admin can clear group history.");
  const { error: updateError } = await admin.from("conversation_members").update({ cleared_at: new Date().toISOString() }).eq("conversation_id", id).eq("user_id", user.id);
  if (updateError) throwDb(updateError); return { cleared: true };
}

export async function leaveGroup(req: Express.Request, id: string) {
  const user = requireUser(req), admin = getAdminSupabase();
  const own = await memberRow(id, user.id);
  const { data: conv, error } = await admin.from("conversations").select("kind").eq("id", id).single(); if (error) throwDb(error);
  if (conv.kind !== "group") throw new AppError(400, "NOT_A_GROUP", "Only group members can leave a group.");
  const { error: updateError } = await admin.from("conversation_members").update({ left_at: new Date().toISOString() }).eq("conversation_id", id).eq("user_id", user.id); if (updateError) throwDb(updateError);
  if (own.role === "admin") {
    const { data: others } = await admin.from("conversation_members").select("user_id").eq("conversation_id", id).is("left_at", null).neq("user_id", user.id).order("joined_at", { ascending: true }).limit(1);
    if (others?.length) await admin.from("conversation_members").update({ role: "admin" }).eq("conversation_id", id).eq("user_id", (others[0] as any).user_id);
    else await admin.from("conversations").delete().eq("id", id);
  }
  return { left: true };
}

export async function deleteMessage(req: Express.Request, conversationId: string, messageId: string) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(conversationId, user.id);
  const { data: message, error } = await admin.from("messages").select("id,sender_id,created_at,attachment_path").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle();
  if (error) throwDb(error); if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message not found.");
  if (message.sender_id !== user.id) throw new AppError(403, "MESSAGE_DELETE_FORBIDDEN", "You can only unsend your own messages.");
  if (Date.now() - new Date(message.created_at).getTime() > 48 * 60 * 60 * 1000) throw new AppError(403, "UNSEND_WINDOW_EXPIRED", "Messages can only be unsent within 48 hours.");
  const { error: updateError } = await admin.from("messages").update({ body: "", attachment_path: null, attachment_name: null, attachment_mime_type: null, attachment_size_bytes: null, deleted_for_everyone_at: new Date().toISOString(), message_type: "system" }).eq("id", messageId);
  if (updateError) throwDb(updateError);
  if ((message as any).attachment_path) { try { await admin.storage.from(MEDIA_BUCKET).remove([(message as any).attachment_path]); } catch {} }
  return { deleted: true };
}

export async function hideMessageForMe(req: Express.Request, conversationId: string, messageId: string) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(conversationId, user.id);
  const { data: message, error } = await admin.from("messages").select("id").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle();
  if (error) throwDb(error); if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message not found.");
  const { error: hideError } = await admin.from("hidden_messages").upsert({ message_id: messageId, user_id: user.id, hidden_at: new Date().toISOString() }, { onConflict: "message_id,user_id" });
  if (hideError) throwDb(hideError); return { hidden: true };
}

export async function toggleMessageReaction(req: Express.Request, conversationId: string, messageId: string, emoji: string) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(conversationId, user.id);
  if (!["❤️","👍","👎","😂","😮","😢","🙏","🔥","🎉","😍","💯"].includes(emoji)) throw new AppError(400, "INVALID_REACTION", "Choose a valid emoji reaction.");
  const { data: msg, error: msgError } = await admin.from("messages").select("id").eq("id", messageId).eq("conversation_id", conversationId).maybeSingle(); if (msgError) throwDb(msgError); if (!msg) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message not found.");
  const { data: existing, error } = await admin.from("message_reactions").select("id").eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji).maybeSingle(); if (error) throwDb(error);
  if (existing) { const { error: delError } = await admin.from("message_reactions").delete().eq("id", existing.id); if (delError) throwDb(delError); return { active: false }; }
  const { error: insertError } = await admin.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji }); if (insertError) throwDb(insertError); return { active: true };
}

export async function uploadMessageAttachment(req: Express.Request, conversationId: string, file: Express.Multer.File) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(conversationId, user.id);
  if (!file) throw new AppError(400, "FILE_REQUIRED", "Choose a file to attach.");
  const allowed = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","audio/webm","audio/ogg","audio/mpeg","audio/mp4","audio/wav","application/pdf","text/plain","application/zip","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
  const baseMimeType = file.mimetype.split(";")[0].trim().toLowerCase();
  if (!allowed.has(baseMimeType)) throw new AppError(415, "UNSUPPORTED_ATTACHMENT", "This file type is not supported.");
  if (file.size > 50 * 1024 * 1024) throw new AppError(413, "FILE_TOO_LARGE", "Attachments must be 50 MB or smaller.");
  const ext = file.originalname.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${user.id}/messages/${conversationId}/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, file.buffer, { contentType: baseMimeType, upsert: false }); if (error) throw new AppError(400, "UPLOAD_FAILED", error.message);
  const { data } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  return { path, name: file.originalname.slice(0, 255), mimeType: baseMimeType, sizeBytes: file.size, url: data?.signedUrl || null };
}

export async function sendAttachmentMessage(req: Express.Request, id: string, input: { path: string; name: string; mimeType: string; sizeBytes: number; messageType: string; body?: string }) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(id, user.id);
  if (!input.path.startsWith(`${user.id}/messages/${id}/`)) throw new AppError(403, "INVALID_ATTACHMENT_PATH", "This attachment does not belong to you or this conversation.");
  const allowed = new Set(["image","video","file","voice"]); if (!allowed.has(input.messageType)) throw new AppError(400, "INVALID_MESSAGE_TYPE", "Unsupported attachment type.");
  const { data: signed, error: signedError } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(input.path, 3600);
  if (signedError || !signed?.signedUrl) throw new AppError(400, "ATTACHMENT_NOT_FOUND", "The uploaded attachment could not be found. Please upload it again.");
  const { data, error } = await admin.from("messages").insert({ conversation_id: id, sender_id: user.id, body: (input.body || "").trim(), message_type: input.messageType, attachment_path: input.path, attachment_name: input.name, attachment_mime_type: input.mimeType, attachment_size_bytes: input.sizeBytes }).select("id,conversation_id,sender_id,body,created_at,message_type,attachment_path,attachment_name,attachment_mime_type,attachment_size_bytes,deleted_for_everyone_at").single();
  if (error) throwDb(error);
  try { const { data: recipients } = await admin.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", user.id).is("left_at", null); if (recipients?.length) { await admin.from("message_receipts").upsert(recipients.map((recipient: any) => ({ message_id: data.id, user_id: recipient.user_id })), { onConflict: "message_id,user_id" }); await admin.from("notifications").insert(recipients.map((recipient: any) => ({ user_id: recipient.user_id, actor_id: user.id, type: "message", message: input.messageType === "voice" ? "You received a voice note." : `You received an attachment: ${input.name}.` }))); } } catch { /* Notification delivery is independent of message delivery. */ }
  return { id: data.id, conversationId: data.conversation_id, senderId: data.sender_id, body: data.body, createdAt: data.created_at, messageType: data.message_type, attachmentName: data.attachment_name, attachmentMimeType: data.attachment_mime_type, attachmentSizeBytes: data.attachment_size_bytes, attachmentUrl: signed.signedUrl, reactions: [] };
}

export async function sendCallSignal(req: Express.Request, id: string, input: { recipientId: string; callId: string; signalType: "offer"|"answer"|"ice"|"hangup"|"reject"; payload?: unknown }) {
  const user = requireUser(req), admin = getAdminSupabase(); if (input.recipientId === user.id) throw new AppError(400, "INVALID_CALL_RECIPIENT", "You cannot call yourself."); await memberRow(id, user.id); await memberRow(id, input.recipientId);
  if (!input.callId || input.callId.length > 100) throw new AppError(400, "INVALID_CALL_ID", "Invalid call session.");
  const { error } = await admin.from("call_signals").insert({ conversation_id: id, sender_id: user.id, recipient_id: input.recipientId, call_id: input.callId, signal_type: input.signalType, payload: input.payload || {} }); if (error) throwDb(error); return { sent: true };
}
export async function receiveCallSignals(req: Express.Request, id: string, after?: string) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(id, user.id);
  let query = admin.from("call_signals").select("id,sender_id,recipient_id,call_id,signal_type,payload,created_at").eq("conversation_id", id).eq("recipient_id", user.id).is("consumed_at", null).order("created_at", { ascending: true }).limit(100);
  if (after) query = query.gt("created_at", after);
  const { data, error } = await query; if (error) throwDb(error);
  const rows = data || []; if (rows.length) await admin.from("call_signals").update({ consumed_at: new Date().toISOString() }).in("id", rows.map((x: any) => x.id)).eq("recipient_id", user.id);
  return { items: rows };
}


export async function setTyping(req: Express.Request, id: string, typing: boolean) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(id, user.id);
  if (typing) { const { error } = await admin.from("conversation_typing").upsert({ conversation_id: id, user_id: user.id, expires_at: new Date(Date.now()+5000).toISOString() }, { onConflict: "conversation_id,user_id" }); if (error) throwDb(error); }
  else { const { error } = await admin.from("conversation_typing").delete().eq("conversation_id", id).eq("user_id", user.id); if (error) throwDb(error); }
  return { typing };
}
export async function typingStatus(req: Express.Request, id: string) {
  const user = requireUser(req), admin = getAdminSupabase(); await memberRow(id, user.id);
  const { data, error } = await admin.from("conversation_typing").select("user_id").eq("conversation_id", id).neq("user_id", user.id).gt("expires_at", new Date().toISOString()); if (error) throwDb(error);
  return { typing: Boolean(data?.length) };
}
