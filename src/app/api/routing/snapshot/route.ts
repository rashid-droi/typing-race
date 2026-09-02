import { getRoomManager } from "../../../../../server/game/manager";

export async function GET() {
  return Response.json(getRoomManager().routingSnapshot());
}
