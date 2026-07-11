Attendenz

Attendenz is an offline-first attendance management application designed for MBBS students. It allows multiple users to manage classes, subjects, wards, and attendance independently on the same device, with optional cloud synchronization support.

Features

* Multi-account support
* Per-user isolated data storage
* Attendance tracking
* Subject management
* Ward management
* Offline-first architecture
* Optional Cloudflare D1/Workers backend for cloud sync
* Fast local data access

Tech Stack

* React
* TypeScript
* IndexedDB / Local Storage
* Cloudflare D1
* Cloudflare Workers

Project Structure

* src/ – Application source code
* cloudflare/ – Backend configuration and Workers
* public/ – Static assets

Getting Started

1. Clone the repository.
2. Install dependencies:

npm install

3. Start the development server:

npm run dev

4. Build for production:

npm run build

Current Status

* ✅ Multi-account support completed
* ✅ Per-user data isolation completed
* ✅ Cloudflare backend foundation added
* 🚧 Cloud synchronization in progress
* 🚧 Additional UI improvements planned

Roadmap

* Cloud sync
* Backup & restore
* Export attendance reports
* Push notifications
* Performance optimizations
