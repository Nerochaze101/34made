import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const CHAT_ID_PATTERN = /^(-?\d{4,20}|@[A-Za-z0-9_]{5,32})$/;

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'application/octet-stream',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_VIDEO_BYTES,
    files: 1,
  },
});

interface TelegramChatSummary {
  id: string;
  title: string;
  type: string;
  username?: string;
}

interface TelegramGetMeResponse {
  ok: boolean;
  result?: {
    username?: string;
    first_name?: string;
  };
  description?: string;
}

interface TelegramChatPayload {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdateItem {
  message?: {
    chat?: TelegramChatPayload;
  };
  channel_post?: {
    chat?: TelegramChatPayload;
  };
  my_chat_member?: {
    chat?: TelegramChatPayload;
  };
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdateItem[];
  description?: string;
}

interface TelegramSendVideoResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    chat?: {
      id?: number;
      title?: string;
      username?: string;
      first_name?: string;
    };
  };
  description?: string;
}

function getBotToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getDefaultChatId(): string {
  return (process.env.TELEGRAM_CHAT_ID || '').trim();
}

function sanitizeCaption(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 1024);
}

function clampDimension(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(240, Math.min(2160, Math.round(n)));
}

function sanitizeFilename(raw: string | undefined, mimeType: string): string {
  const base = (raw || 'tiktok-reel')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
  if (base.endsWith('.mp4') || base.endsWith('.webm')) {
    return base;
  }
  return `${base || 'tiktok-reel'}.${ext}`;
}

async function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/telegram/status', async (_req: Request, res: Response) => {
    const token = getBotToken();
    const defaultChatId = getDefaultChatId();
    if (!token) {
      res.json({
        configured: false,
        defaultChatId,
      });
      return;
    }

    try {
      const tgRes = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getMe`, {
        signal: AbortSignal.timeout(6000),
      });
      const data = (await tgRes.json()) as TelegramGetMeResponse;
      if (!tgRes.ok || !data.ok) {
        res.status(502).json({
          configured: false,
          defaultChatId,
          error: 'Configured Telegram bot token could not be verified.',
        });
        return;
      }

      res.json({
        configured: true,
        botUsername: data.result?.username || '',
        botName: data.result?.first_name || 'Telegram Bot',
        defaultChatId,
      });
    } catch {
      res.status(502).json({
        configured: false,
        defaultChatId,
        error: 'Unable to reach Telegram right now.',
      });
    }
  });

  app.get('/api/telegram/chats', async (_req: Request, res: Response) => {
    const token = getBotToken();
    if (!token) {
      res.status(503).json({
        error: 'TELEGRAM_BOT_TOKEN is not configured in server secrets.',
      });
      return;
    }

    try {
      const url = `${TELEGRAM_API_BASE}/bot${token}/getUpdates?limit=40&allowed_updates=${encodeURIComponent(
        JSON.stringify(['message', 'channel_post', 'my_chat_member'])
      )}`;
      const tgRes = await fetch(url, {
        signal: AbortSignal.timeout(6000),
      });
      const data = (await tgRes.json()) as TelegramGetUpdatesResponse;
      if (!tgRes.ok || !data.ok) {
        res.status(502).json({
          error: data.description || 'Could not fetch recent Telegram chats.',
        });
        return;
      }

      const seen = new Map<string, TelegramChatSummary>();
      const defaultChatId = getDefaultChatId();
      if (defaultChatId && CHAT_ID_PATTERN.test(defaultChatId)) {
        seen.set(defaultChatId, {
          id: defaultChatId,
          title: `Default Chat (${defaultChatId})`,
          type: 'configured',
        });
      }

      for (const item of data.result || []) {
        const chat =
          item.message?.chat ||
          item.channel_post?.chat ||
          item.my_chat_member?.chat;
        if (!chat || typeof chat.id !== 'number') continue;

        const idStr = String(chat.id);
        const fullName = [chat.first_name, chat.last_name]
          .filter(Boolean)
          .join(' ')
          .trim();
        const title =
          chat.title ||
          fullName ||
          (chat.username ? `@${chat.username}` : `Chat ${idStr}`);

        seen.set(idStr, {
          id: idStr,
          title,
          type: chat.type || 'private',
          username: chat.username,
        });
      }

      res.json({
        chats: Array.from(seen.values()),
      });
    } catch {
      res.status(502).json({
        error: 'Failed to load Telegram chats.',
      });
    }
  });

  app.post(
    '/api/telegram/send',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('video')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(413).json({
              error: 'Video exceeds Telegram’s 50 MB Bot API upload limit.',
            });
            return;
          }
          res.status(400).json({ error: err.message });
          return;
        }
        if (err) {
          res.status(400).json({ error: 'Invalid video upload payload.' });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      const token = getBotToken();
      if (!token) {
        res.status(503).json({
          error:
            'TELEGRAM_BOT_TOKEN is not configured. Add it in AI Studio Settings → Secrets.',
        });
        return;
      }

      const rawChatId =
        typeof req.body?.chatId === 'string' && req.body.chatId.trim()
          ? req.body.chatId.trim()
          : getDefaultChatId();

      if (!rawChatId || !CHAT_ID_PATTERN.test(rawChatId)) {
        res.status(400).json({
          error:
            'Provide a valid Telegram Chat ID (e.g. 123456789 or -1001234567890) or @channelusername.',
        });
        return;
      }

      const file = req.file;
      if (!file || file.size === 0) {
        res.status(400).json({ error: 'No video file was provided.' });
        return;
      }

      const baseMime = (file.mimetype || 'video/mp4').split(';')[0].trim();
      if (!ALLOWED_VIDEO_MIMES.has(baseMime)) {
        res.status(400).json({
          error: 'Only MP4 or WebM video files can be sent to Telegram.',
        });
        return;
      }

      const filename = sanitizeFilename(file.originalname, baseMime);
      const caption = sanitizeCaption(req.body?.caption);
      const width = clampDimension(req.body?.width, 720);
      const height = clampDimension(req.body?.height, 1280);

      const form = new FormData();
      form.append('chat_id', rawChatId);
      if (caption) {
        form.append('caption', caption);
      }
      form.append('width', String(width));
      form.append('height', String(height));
      form.append('supports_streaming', 'true');

      const videoBytes = new Uint8Array(file.buffer);
      const videoBlob = new Blob([videoBytes], {
        type: baseMime === 'application/octet-stream' ? 'video/mp4' : baseMime,
      });
      form.append('video', videoBlob, filename);

      try {
        const tgRes = await fetch(
          `${TELEGRAM_API_BASE}/bot${token}/sendVideo`,
          {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(45000),
          }
        );

        const data = (await tgRes.json()) as TelegramSendVideoResponse;
        if (!tgRes.ok || !data.ok) {
          res.status(502).json({
            error:
              data.description ||
              'Telegram rejected the upload. Confirm the bot has permission to message that chat.',
          });
          return;
        }

        const chat = data.result?.chat;
        const chatTitle =
          chat?.title ||
          chat?.first_name ||
          (chat?.username ? `@${chat.username}` : rawChatId);

        res.json({
          ok: true,
          messageId: data.result?.message_id ?? null,
          chatId: rawChatId,
          chatTitle,
        });
      } catch {
        res.status(502).json({
          error: 'Timed out or failed while uploading video to Telegram.',
        });
      }
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
