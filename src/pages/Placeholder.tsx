import { Construction } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Placeholder({
  titulo,
  fase,
}: {
  titulo: string;
  fase: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Construction className="h-5 w-5 text-primary" />
            Em construção
          </CardTitle>
          <CardDescription>
            Esta tela será implementada na {fase} do roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          A FASE 0 entrega a fundação técnica (auth, schema/RLS, worker e o
          painel base). As telas completas chegam nas fases seguintes.
        </CardContent>
      </Card>
    </div>
  );
}
