import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Загружаем .env из корня репозитория (server/src -> repo). Импортируется первым в index.ts,
// чтобы переменные были доступны до чтения конфигурации.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
