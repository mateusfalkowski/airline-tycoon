# Airline Tycoon

Jogo de gestão de companhia aérea inspirado no **Airline Manager 4**. Single-player, roda inteiramente no navegador (progresso salvo em `localStorage`), com voos que se desenrolam em tempo real e uma bolsa de valores onde bots negociam ações da sua empresa.

Jogue em: https://mateusfalkowski.github.io/airline-tycoon/

## Mecânicas atuais

- Fundação da companhia com hub inicial e caixa de partida
- Mercado de aeronaves (regionais, corredor único e longo curso), cada uma com alcance, consumo e custo de manutenção diferentes
- Criação de rotas entre aeroportos reais (distância calculada por coordenadas) e despacho de voos com duração real baseada na velocidade da aeronave
- Simulação de demanda/ocupação a partir do preço da passagem, distância e reputação da companhia
- Bolsa de valores: IPO da empresa, preço da ação reagindo à valuation, bots comprando e vendendo ações ao longo do tempo, opção de vender mais ações ou recomprar para retomar controle
- Extrato financeiro com o histórico de eventos

## Rodando localmente

```bash
npm install
npm run dev
```

## Stack

Vite + React + TypeScript + Zustand, sem backend — todo o estado do jogo vive no `localStorage` do navegador.
