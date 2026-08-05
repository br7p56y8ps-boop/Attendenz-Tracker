Attendenz

Attendenz is an offline-first attendance management application designed for MBBS students. It allows multiple users to manage classes, subjects, wards, and attendance independently on the same device, with optional cloud synchronization support.

Features

* Attendance tracking
* Subject management
* Ward management
* Offline-first architecture
* Fast local data access

Tech Stack

* React
* TypeScript
* IndexedDB / Local Storage
* Cloudflare Workers

Project Structure

* src/ – Application source code
* public/ – Static assets

Getting Started

1. Clone the repository.
2. Install dependencies:

pnpm install

3. Start the development server:

pnpm run dev

4. Build for production:

pnpm run build

Current Status

* ✅ Per-user data isolation completed
* ✅ Cloudflare backend foundation added
* 🚧 Cloud synchronization in progress
* 🚧 Additional UI improvements planned

Roadmap

* Backup & restore
* Export attendance reports
* Push notifications
* Performance optimizations
