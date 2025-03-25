const express = require('express')
const WebSocket = require('ws')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

// Инициализация базы данных
const db = new sqlite3.Database('chat.db')

if (!fs.existsSync('chat.db')) {
	fs.writeFileSync('chat.db', '')
}

// Создание таблиц
db.serialize(() => {
	db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `)

	db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
})

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Маршруты API
app.post('/register', (req, res) => {
	const { username, password } = req.body

	db.run(
		'INSERT INTO users (username, password) VALUES (?, ?)',
		[username, password],
		function (err) {
			if (err) {
				return res.status(400).json({ error: 'Пользователь уже существует' })
			}
			res.json({ message: 'Регистрация успешна!' })
		}
	)
})

app.post('/login', (req, res) => {
	const { username, password } = req.body

	db.get(
		'SELECT * FROM users WHERE username = ? AND password = ?',
		[username, password],
		(err, row) => {
			if (err || !row) {
				return res.status(400).json({ error: 'Неверный логин или пароль' })
			}
			res.json({ message: 'Авторизация успешна!' })
		}
	)
})

const server = app.listen(3000, () => {
	console.log('HTTP сервер запущен на http://localhost:3000')
})

// WebSocket сервер
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws) => {
	console.log('Новое WebSocket подключение')

	// Отправка истории сообщений
	db.all(
		'SELECT username, message FROM messages ORDER BY timestamp DESC LIMIT 100',
		(err, rows) => {
			if (!err) {
				ws.send(
					JSON.stringify({
						type: 'history',
						messages: rows.reverse(),
					})
				)
			}
		}
	)

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message)

			if (data.type === 'join') {
				// Новый пользователь присоединился
				db.run(
					'INSERT INTO messages (username, message) VALUES (?, ?)',
					[data.username, 'присоединился к чату'],
					() => {
						broadcast({
							type: 'notification',
							text: `${data.username} присоединился к чату`,
						})
					}
				)
			} else if (data.type === 'message') {
				// Новое сообщение
				db.run(
					'INSERT INTO messages (username, message) VALUES (?, ?)',
					[data.username, data.text],
					() => {
						broadcast({
							type: 'message',
							username: data.username,
							text: data.text,
						})
					}
				)
			} else if (data.type === 'leave') {
				// Пользователь вышел
				db.run(
					'INSERT INTO messages (username, message) VALUES (?, ?)',
					[data.username, 'покинул чат'],
					() => {
						broadcast({
							type: 'notification',
							text: `${data.username} покинул чат`,
						})
					}
				)
			}
		} catch (e) {
			console.error('Ошибка обработки сообщения:', e)
		}
	})

	function broadcast(data) {
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(data))
			}
		})
	}
})

console.log('WebSocket сервер запущен на ws://localhost:3000')
