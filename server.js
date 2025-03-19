const express = require('express');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Инициализация базы данных
const db = new sqlite3.Database('chat.db');

// Создание таблиц
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Настройка Express
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для отдачи index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Регистрация пользователя
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
    if (err) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    res.json({ message: 'Регистрация успешна!' });
  });
});

// Авторизация пользователя
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err || !row) {
      return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    res.json({ message: 'Авторизация успешна!' });
  });
});

// Запуск HTTP-сервера
const server = app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});

// Настройка WebSocket
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Новое подключение');

  // Отправка истории сообщений новому пользователю
  db.all('SELECT username, message FROM messages ORDER BY timestamp DESC LIMIT 100', (err, rows) => {
    if (!err) {
      ws.send(JSON.stringify({ type: 'history', messages: rows.reverse() }));
    }
  });

  // Обработка новых сообщений
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'join') {
      // Уведомление о подключении пользователя
      const { username } = data;

      // Вставляем уведомление в базу данных
      db.run(
        'INSERT INTO messages (username, message) VALUES (?, ?)',
        [username, 'присоединился к чату'],
        (err) => {
          if (err) {
            console.error('Ошибка при вставке уведомления:', err);
            return;
          }

          // Рассылка уведомления всем клиентам
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'notification', text: `${username} присоединился к чату` }));
            }
          });
        }
      );
    } else if (data.type === 'message') {
      // Обработка обычных сообщений
      const { username, text } = data;

      // Вставляем сообщение в базу данных
      db.run(
        'INSERT INTO messages (username, message) VALUES (?, ?)',
        [username, text],
        (err) => {
          if (err) {
            console.error('Ошибка при вставке сообщения:', err);
            return;
          }

          // Рассылка сообщения всем клиентам
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'message', username, text }));
            }
          });
        }
      );
    }
  });

  // Обработка закрытия соединения
  ws.on('close', () => {
    console.log('Подключение закрыто');
  });
});