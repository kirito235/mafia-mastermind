import { createFileRoute } from "@tanstack/react-router";
import { MafiaCity } from "@/components/mafia/MafiaCity";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <MafiaCity />;
}
