const authDiv = document.getElementById('auth')
const chatDiv = document.getElementById('chat')
const messagesDiv = document.getElementById('messages')
const messageInput = document.getElementById('message')
const sendButton = document.getElementById('send')
const usernameInput = document.getElementById('username')
const passwordInput = document.getElementById('password')
const registerButton = document.getElementById('register')
const loginButton = document.getElementById('login')
const logoutButton = document.getElementById('logout')

// Состояние приложения
let username = ''
let ws = null

// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', () => {
	const savedUsername = localStorage.getItem('username')
	if (savedUsername) {
		username = savedUsername
		showChat()
		connectWebSocket()
	}
})

// Регистрация
registerButton.addEventListener('click', async () => {
	const username = usernameInput.value.trim()
	const password = passwordInput.value.trim()

	if (!username || !password) {
		alert('Заполните все поля')
		return
	}

	try {
		const response = await fetch('http://localhost:3000/register', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password }),
		})

		const result = await response.json()
		if (result.error) {
			alert(result.error)
		} else {
			alert('Регистрация успешна! Теперь войдите')
			passwordInput.value = ''
		}
	} catch (error) {
		console.error('Ошибка регистрации:', error)
		alert('Ошибка соединения с сервером')
	}
})

// Вход
loginButton.addEventListener('click', async () => {
	const usernameValue = usernameInput.value.trim()
	const password = passwordInput.value.trim()

	if (!usernameValue || !password) {
		alert('Заполните все поля')
		return
	}

	try {
		// Проверка доступности сервера
		const ping = await fetch('http://localhost:3000')
		if (!ping.ok) throw new Error('Сервер не отвечает')

		const response = await fetch('http://localhost:3000/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: usernameValue,
				password,
			}),
		})

		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.error || 'Ошибка сервера')
		}

		const result = await response.json()
		username = usernameValue
		localStorage.setItem('username', username)
		showChat()
		connectWebSocket()
	} catch (error) {
		console.error('Ошибка входа:', error)
		alert(error.message || 'Ошибка соединения с сервером')
	}
})

// Выход
logoutButton.addEventListener('click', () => {
	if (confirm('Вы действительно хотите выйти?')) {
		if (ws) {
			ws.send(JSON.stringify({ type: 'leave', username }))
			ws.close()
		}
		username = ''
		localStorage.removeItem('username')
		showAuth()
		messagesDiv.innerHTML = ''
	}
})

// WebSocket соединение
function connectWebSocket() {
	ws = new WebSocket('ws://localhost:3000')

	ws.onopen = () => {
		console.log('WebSocket подключен')
		ws.send(
			JSON.stringify({
				type: 'join',
				username,
			})
		)
	}

	ws.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data)

			if (data.type === 'history') {
				data.messages.forEach((msg) => addMessage(msg.username, msg.message))
			} else if (data.type === 'message') {
				addMessage(data.username, data.text)
			} else if (data.type === 'notification') {
				addNotification(data.text)
			}
		} catch (e) {
			console.error('Ошибка обработки сообщения:', e)
		}
	}

	ws.onclose = () => {
		console.log('WebSocket отключен')
	}

	ws.onerror = (error) => {
		console.error('WebSocket ошибка:', error)
	}
}

// Отправка сообщения
function setupMessageSending() {
	function sendMessage() {
		const message = messageInput.value.trim()
		if (message && ws && ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					type: 'message',
					username,
					text: message,
				})
			)
			messageInput.value = ''
		}
	}

	sendButton.addEventListener('click', sendMessage)
	messageInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') sendMessage()
	})
}

// Добавление сообщения
function addMessage(sender, text) {
	const messageElement = document.createElement('div')
	messageElement.classList.add('message')
	messageElement.classList.add(sender === username ? 'user' : 'other')

	const senderName = sender === username ? 'Вы' : sender
	messageElement.innerHTML = `<strong>${senderName}:</strong> ${text}`

	messagesDiv.appendChild(messageElement)
	messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// Добавление уведомления
function addNotification(text) {
	const notificationElement = document.createElement('div')
	notificationElement.classList.add('message', 'notification')
	notificationElement.textContent = text
	messagesDiv.appendChild(notificationElement)
	messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// Переключение между экранами
function showChat() {
	authDiv.style.display = 'none'
	chatDiv.style.display = 'flex'
	messageInput.focus()
}

function showAuth() {
	authDiv.style.display = 'block'
	chatDiv.style.display = 'none'
	usernameInput.focus()
}

// Инициализация
setupMessageSending()
