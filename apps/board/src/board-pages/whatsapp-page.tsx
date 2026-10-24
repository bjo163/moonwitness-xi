'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AttachmentIcon,
  SendIcon,
  SignalIcon,
  SignalOffIcon,
  SmartphoneIcon,
  UsersIcon,
} from '@moonwitness/ui/icons';
import { toast } from '@moonwitness/ui/components/toast';
import { Button } from '@moonwitness/ui/components/button';
import { Input } from '@moonwitness/ui/components/input';
import { Skeleton } from '@moonwitness/ui/components/skeleton';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { client } from '@/lib/client';
import { scopedQueryKey } from '@/lib/query-scope';

type Account = {
  id?: number;
  status: string;
  phone_number?: string | null;
  qr_code?: string | null;
  last_error?: string | null;
};
type Conversation = {
  id: number;
  jid: string;
  name: string;
  is_group: boolean;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
};
type Message = {
  id: number;
  direction: string;
  content?: string | null;
  status: string;
  message_type: string;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  sender_jid?: string | null;
  create_date: string;
};
const statusLabel: Record<string, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  qr: 'Scan the QR code',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Connection error',
};

export function WhatsappPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [qr, setQr] = useState<{ code: string; image: string } | null>(null);
  const accountQuery = useQuery({
    queryKey: scopedQueryKey(['whatsapp', 'account']),
    queryFn: async () => (await client.request<{ data: Account }>('/whatsapp/account')).data,
    refetchInterval: 3000,
  });
  const conversationsQuery = useQuery({
    queryKey: scopedQueryKey(['whatsapp', 'conversations']),
    queryFn: async () =>
      (await client.request<{ data: Conversation[] }>('/whatsapp/conversations')).data,
    enabled: accountQuery.data?.status === 'connected',
    refetchInterval: 5000,
  });
  const activeConversation =
    conversationsQuery.data?.find((item) => item.id === selected) ?? conversationsQuery.data?.[0];
  const messagesQuery = useQuery({
    queryKey: scopedQueryKey(['whatsapp', 'messages', activeConversation?.id]),
    queryFn: async () =>
      (
        await client.request<{ data: Message[] }>(
          `/whatsapp/conversations/${activeConversation!.id}/messages`
        )
      ).data,
    enabled: accountQuery.data?.status === 'connected' && Boolean(activeConversation),
    refetchInterval: 2500,
  });

  useEffect(() => {
    let cancelled = false;
    const code = accountQuery.data?.qr_code;
    if (!code) return;
    if (code.startsWith('data:image/')) return;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(code, { width: 256, margin: 1 }))
      .then((image) => {
        if (!cancelled) setQr({ code, image });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accountQuery.data?.qr_code]);

  const connect = async () => {
    try {
      await client.request('/whatsapp/connect', { method: 'POST', body: {} });
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start WhatsApp connection');
    }
  };
  const disconnect = async () => {
    try {
      await client.request('/whatsapp/disconnect', { method: 'POST', body: {} });
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect WhatsApp');
    }
  };
  const startChat = async (event: FormEvent) => {
    event.preventDefault();
    if (startingChat) return;
    setStartingChat(true);
    try {
      const response = await client.request<{ data: Conversation }>('/whatsapp/conversations', {
        method: 'POST',
        body: { phone: newPhone.trim() },
      });
      setNewPhone('');
      await queryClient.invalidateQueries({
        queryKey: scopedQueryKey(['whatsapp', 'conversations']),
      });
      setSelected(response.data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start conversation');
    } finally {
      setStartingChat(false);
    }
  };

  const account = accountQuery.data;
  const status = account?.status ?? 'disconnected';
  const connected = status === 'connected';
  const statusIcon = connected ? (
    <SignalIcon className="size-4" />
  ) : (
    <SignalOffIcon className="size-4" />
  );
  const messageList = messagesQuery.data ?? [];
  const qrImage = account?.qr_code?.startsWith('data:image/')
    ? account.qr_code
    : qr && qr.code === account?.qr_code
      ? qr.image
      : null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-5 p-4 md:p-8">
      <Breadcrumbs items={[{ label: 'WhatsApp' }]} />
      {(accountQuery.isError || conversationsQuery.isError || messagesQuery.isError) && (
        <p role="alert" className="border-2 border-ink bg-pink p-3 text-sm">
          Could not load WhatsApp data. Retrying automatically.
        </p>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-paper p-5 shadow-[4px_4px_0_0_var(--ink)]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">
            Company inbox
          </p>
          <h1 className="font-display text-3xl uppercase">WhatsApp</h1>
          <p className="mt-1 flex items-center gap-2 text-sm">
            {statusIcon}
            <span>{statusLabel[status] ?? status}</span>
            {account?.phone_number && <span className="font-mono">+{account.phone_number}</span>}
          </p>
          {account?.last_error && <p className="mt-2 text-sm text-red-700">{account.last_error}</p>}
        </div>
        {['connected', 'connecting', 'qr', 'reconnecting'].includes(status) ? (
          <Button type="button" variant="outline" onClick={disconnect}>
            {connected ? 'Disconnect' : 'Cancel connection'}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={connect}
            disabled={['connecting', 'qr', 'reconnecting'].includes(status)}
          >
            <SmartphoneIcon className="mr-2 size-4" />
            Connect WhatsApp
          </Button>
        )}
      </header>
      {status === 'qr' && (
        <section className="flex flex-col items-center border-2 border-ink bg-white p-6 text-center shadow-[4px_4px_0_0_var(--ink)]">
          <h2 className="font-display text-xl uppercase">Scan with WhatsApp</h2>
          <p className="mt-1 text-sm">Open Linked devices on your phone and scan this code.</p>
          {qrImage ? (
            <img src={qrImage} alt="WhatsApp connection QR code" className="mt-4 size-64" />
          ) : (
            <Skeleton className="mt-4 size-64" />
          )}
        </section>
      )}
      {connected && (
        <section className="grid min-h-[60vh] flex-1 overflow-hidden border-2 border-ink bg-paper shadow-[4px_4px_0_0_var(--ink)] md:grid-cols-[minmax(240px,0.38fr)_1fr]">
          <aside className="border-b-2 border-ink md:border-b-0 md:border-r-2">
            <div className="border-b-2 border-ink p-4">
              <h2 className="font-display text-lg uppercase">Conversations</h2>
              <form onSubmit={startChat} className="mt-3 flex gap-2">
                <Input
                  aria-label="Phone number with country code"
                  placeholder="6281234567890"
                  value={newPhone}
                  onChange={(event) => setNewPhone(event.target.value)}
                  disabled={startingChat}
                  inputMode="tel"
                />
                <Button type="submit" disabled={startingChat || !newPhone.trim()}>
                  New chat
                </Button>
              </form>
            </div>
            {conversationsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : conversationsQuery.data?.length ? (
              conversationsQuery.data.map((conversation) => (
                <Button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelected(conversation.id)}
                  variant="ghost"
                  className={`h-auto w-full justify-start border-b border-ink/20 p-4 text-left hover:bg-pink/20 ${activeConversation?.id === conversation.id ? 'bg-pink/30' : ''}`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {conversation.is_group && <UsersIcon className="size-4" />}
                    {conversation.name}
                    {conversation.unread_count > 0 && (
                      <span className="ml-auto rounded-full bg-pink px-2 text-xs">
                        {conversation.unread_count}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-sm text-ink-faint">
                    {conversation.last_message}
                  </span>
                </Button>
              ))
            ) : (
              <p className="p-4 text-sm text-ink-faint">No conversations yet.</p>
            )}
          </aside>
          <div className="flex min-h-[55vh] flex-col">
            <div className="border-b-2 border-ink p-4">
              <h2 className="font-display text-lg uppercase">
                {activeConversation?.name ?? 'Select a conversation'}
              </h2>
              {activeConversation?.is_group && (
                <span className="text-xs text-ink-faint">Group conversation</span>
              )}
            </div>
            <div className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4">
              {messageList.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[85%] border-2 border-ink p-3 ${message.direction === 'outbound' ? 'ml-auto bg-pink/30' : 'mr-auto bg-white'}`}
                >
                  {activeConversation?.is_group &&
                    message.direction === 'inbound' &&
                    message.sender_jid && (
                      <p className="mb-1 font-mono text-[10px] text-ink-faint">
                        {message.sender_jid.split('@')[0]?.split(':')[0]}
                      </p>
                    )}
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  {message.message_type !== 'text' && <MediaPreview message={message} />}
                  {message.media_file_name && (
                    <p className="mt-1 text-xs">{message.media_file_name}</p>
                  )}
                  <p className="mt-2 text-right font-mono text-[10px] text-ink-faint">
                    {message.status}
                  </p>
                </article>
              ))}
            </div>
            {activeConversation && (
              <MessageComposer key={activeConversation.id} conversationId={activeConversation.id} />
            )}
          </div>
        </section>
      )}
      {!connected && status !== 'qr' && (
        <section className="border-2 border-ink bg-white p-8 text-center">
          <SmartphoneIcon className="mx-auto size-10" />
          <h2 className="mt-3 font-display text-xl uppercase">Connect a WhatsApp account</h2>
          <p className="mt-1 text-sm text-ink-faint">
            One WhatsApp account is available for this company.
          </p>
        </section>
      )}
    </main>
  );
}

function MessageComposer({ conversationId }: { conversationId: number }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sendLock.current || (!draft.trim() && !file)) return;
    if (file && file.size > 8 * 1024 * 1024) {
      toast.error('File must be 8 MB or smaller');
      return;
    }
    sendLock.current = true;
    setSending(true);
    try {
      const media_base64 = file
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
            reader.onerror = () => reject(new Error('Could not read file'));
            reader.readAsDataURL(file);
          })
        : undefined;
      await client.request(`/whatsapp/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          content: draft.trim(),
          ...(file
            ? {
                media_base64,
                media_mime_type: file.type || 'application/octet-stream',
                media_file_name: file.name,
              }
            : {}),
        },
      });
      setDraft('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await queryClient.invalidateQueries({ queryKey: scopedQueryKey(['whatsapp']) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message could not be queued');
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-2 border-t-2 border-ink p-3">
      <div className="flex items-center gap-2">
        <label
          className="cursor-pointer rounded border-2 border-ink p-2 hover:bg-pink/20"
          title="Attach media"
        >
          <span className="sr-only">Attach media</span>
          <AttachmentIcon className="size-4" />
          <Input
            type="file"
            ref={fileInput}
            disabled={sending}
            aria-label="Attach media"
            className="sr-only"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message…"
          maxLength={8000}
          disabled={sending}
        />
        <Button
          type="submit"
          disabled={sending || (!draft.trim() && !file)}
          aria-label="Send message"
        >
          <SendIcon className="size-4" />
        </Button>
      </div>
      {file && (
        <p className="text-xs">
          Attached: {file.name}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 underline"
            onClick={() => {
              setFile(null);
              if (fileInput.current) fileInput.current.value = '';
            }}
          >
            Remove
          </Button>
        </p>
      )}
    </form>
  );
}

function MediaPreview({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void client
      .request<Blob>(`/whatsapp/media/${message.id}`, { responseType: 'blob' })
      .then((blob) => {
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id]);
  if (failed)
    return (
      <p role="status" className="mt-2 text-xs text-ink-faint">
        Attachment could not be loaded.
      </p>
    );
  if (!url) return <p className="mt-2 text-xs text-ink-faint">Loading attachment…</p>;
  if (message.media_mime_type?.startsWith('image/'))
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt={message.media_file_name ?? 'WhatsApp media'}
          className="mt-2 max-h-64 max-w-full object-contain"
        />
      </a>
    );
  if (message.media_mime_type?.startsWith('video/'))
    return <video controls src={url} className="mt-2 max-h-64 max-w-full" />;
  if (message.media_mime_type?.startsWith('audio/'))
    return <audio controls src={url} className="mt-2 max-w-full" />;
  return (
    <a
      href={url}
      download={message.media_file_name ?? 'attachment'}
      className="mt-2 inline-block underline"
    >
      Download attachment
    </a>
  );
}
