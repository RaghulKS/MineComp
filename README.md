# WorldOS

Your computer is now a world. `client/` = React + Three.js game (Builder A). `server/` = local Windows bridge (Builder B).

## Run the server
```
cd server && npm install && npm run dev      # http://localhost:8787  ws://localhost:8787/ws
```
Runs natively on Windows or inside WSL (reaches the host through /mnt/c + cmd.exe). Exposes only Desktop, Documents, Downloads (OneDrive-redirected folders are resolved). No file contents are read or copied.
