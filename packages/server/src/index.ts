import { Server } from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.PORT) || 2567;

const server = new Server();

server.define("game", GameRoom);

server.listen(port).then(() => {
  console.log(`[RogueEr] Server listening on ws://localhost:${port}`);
});
