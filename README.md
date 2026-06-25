# 🎮 FlickCrik — Flick. Hit. Win.

**FlickCrik** is a real-time multiplayer web game inspired by the classic hand cricket game. Play with your friends, compete in teams, and enjoy a fast-paced digital cricket experience directly in your browser.

---

## 🚀 Live Demo

👉 https://flick-crik.vercel.app/

---

## 🧠 Features

* ⚡ **Real-time Multiplayer**

  * Create a room and invite friends instantly
  * Join using room code

* 🏏 **Classic Hand Cricket Gameplay**

  * Batting vs Bowling system
  * Runs, wickets, innings logic

* 🧑‍🤝‍🧑 **Team Mode**

  * Split into Team A vs Team B
  * Multiple players with turn rotation

* 🪙 **Coin Toss System**

  * Toss to decide batting/bowling
  * Toss result popup for clarity

* 🔁 **Innings System**

  * First innings + Second innings
  * Target and chase system

* 🤖 **AI Bot Support**

  * Play solo or fill missing players

* 💬 **Live Chat**

  * Chat with players during gameplay
  * Auto cleanup of old messages

* 🎨 **Modern UI**

  * Dark theme
  * Smooth animations
  * Responsive layout

---

## 🛠️ Tech Stack

* **Frontend:** React (Vite)
* **Styling:** Tailwind CSS
* **Backend / Realtime:** Firebase (Firestore)
* **Hosting:** Vercel

---

## 📁 Project Structure

```bash
src/
  components/
  pages/
  firebase/
  gameLogic/
  hooks/
  utils/
```

---

## ⚙️ Setup & Installation

### 1. Clone the repo

```bash
git clone https://github.com/your-username/flickcrik.git
cd flickcrik
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Setup Environment Variables

Create a `.env` file in root:

```env
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

### 4. Run locally

```bash
npm run dev
```

---

## 🚀 Deployment

Deployed using **Vercel**.

Steps:

1. Push code to GitHub
2. Import repo in Vercel
3. Add environment variables
4. Deploy

---

## ⚠️ Notes

* Clear old Firebase rooms if schema changes
* Ensure Firebase rules allow proper access
* Works best in modern browsers

---

## 🔮 Future Improvements

* 🏆 Leaderboard system
* 🎮 Match history & stats
* 🔊 Sound effects
* 📱 Mobile optimization
* 🌍 Public matchmaking

---

## 🤝 Contributing

Feel free to fork and improve the project!

---

## 📜 License

This project is open-source and available under the MIT License.

---

## 👨‍💻 Author

**Akshaay Vardhan**

---

## ⭐ Support

If you like this project, consider giving it a ⭐ on GitHub!
