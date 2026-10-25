
export type NotifyPayload = {
  page: string;
  name: string;
  content: string;
  time: string;
};

function title(p: NotifyPayload): string {
  return `💬 新评论 · ${p.name}`;
}

function body(p: NotifyPayload): string {
  return `${p.content}\n\n—— 来自 ${p.page}\n${p.time}`;
}

async function post(url: string, data: unknown, headers: Record<string, string> = {}) {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(data),
  });
}

async function sendWebhook(p: NotifyPayload, url: string) {
  const text = `${title(p)}\n${body(p)}`;
  await post(url, { msgtype: 'text', text: { content: text }, content: text, title: title(p), body: body(p) });
}

async function sendServerChan(p: NotifyPayload, key: string) {
  const url = key.startsWith('sctp')
    ? `https://${key.split('.')[0]}.push.ft07.com/send/${key}.send`
    : `https://sctapi.ftqq.com/${key}.send`;
  await post(url, { title: title(p), desp: body(p) });
}

async function sendBark(p: NotifyPayload, base: string) {
  const url = base.replace(/\/+$/, '') + '/' + encodeURIComponent(title(p)) + '/' + encodeURIComponent(p.content);
  await fetch(url);
}

async function sendTelegram(p: NotifyPayload, conf: string) {
  const [token, chatId] = conf.split(':');
  if (!token || !chatId) return;
  await post(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: `${title(p)}\n${body(p)}` });
}

export async function notifyNewComment(p: NotifyPayload): Promise<void> {
  const { merged, readCommentsConfig } = await import('./commentsConfig');
  const c = merged(await readCommentsConfig());

  const tasks: Promise<void>[] = [];
  if (c.notifyWebhook) tasks.push(sendWebhook(p, c.notifyWebhook));
  if (c.notifyServerChan) tasks.push(sendServerChan(p, c.notifyServerChan));
  if (c.notifyBark) tasks.push(sendBark(p, c.notifyBark));
  if (c.notifyTelegram) tasks.push(sendTelegram(p, c.notifyTelegram));

  await Promise.allSettled(tasks);
}