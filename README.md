# Mollow — Dashboard de suivi financier

Dashboard connecté en direct à l'API Pennylane pour suivre la trésorerie, le burn net,
le runway, les créances clients, les devis en attente et les factures fournisseurs.

Voir le cahier des charges complet pour le contexte et les objectifs produit.

## Démarrage

```bash
npm install
cp .env.local.example .env.local
# éditer .env.local et renseigner PENNYLANE_API_TOKEN (token du bac à sable en développement)
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Voir [.env.local.example](.env.local.example).

- `PENNYLANE_API_TOKEN` — Company API Token Pennylane (Paramètres > API). En développement,
  utiliser le token du bac à sable (Profil > Test environment > Create my sandbox).
- `DASHBOARD_PASSWORD` — si définie, protège l'app entière par une authentification HTTP
  basique (mot de passe partagé). À définir en production si l'app est accessible publiquement.

Le token n'est **jamais** exposé au client : il n'est lu que dans les routes API
(`src/app/api/**/route.ts` et `src/lib/*.ts`, tous marqués `import "server-only"`).

## Écrans

- `/` — Vue de synthèse : trésorerie, burn net, runway, factures clients en attente,
  courbe de trésorerie sur 12 mois, encaissé vs dépensé par mois.
- `/creances` — Factures clients en attente de paiement + devis envoyés non acceptés.
- `/fournisseurs` — Factures fournisseurs en attente de paiement.
- `/depenses` — Ventilation des dépenses par catégorie analytique Pennylane (12 derniers
  mois), basée sur les catégories réellement taguées dans Pennylane (groupe « Type de
  dépenses »). Les transactions sans catégorie de ce groupe apparaissent en « Non
  catégorisé ». Le groupe est retrouvé par libellé (pas par id, qui diffère entre
  sandbox et production) — voir `findExpenseCategoryGroup` dans `src/lib/finance.ts`.

Chaque écran appelle ses routes API au chargement et propose un bouton « Rafraîchir ».

## Architecture

- `src/lib/pennylane.ts` — client HTTP bas niveau vers l'API Pennylane v2 (pagination par curseur).
- `src/lib/pennylane-types.ts` — types des ressources Pennylane (basés sur la doc publique
  pennylane.readme.io — **à confirmer contre le compte sandbox réel**, voir ci-dessous).
- `src/lib/finance.ts` — logique métier : trésorerie, burn net, burn net moyen, runway,
  agrégation mensuelle, factures/devis en attente.
- `src/app/api/**/route.ts` — routes API Next.js exposant ces calculs au frontend.
- `src/app/*/page.tsx` — écrans (Client Components), graphiques Recharts, tableaux triables.
- `src/proxy.ts` — authentification basique optionnelle (`DASHBOARD_PASSWORD`).

## Vérifications faites contre le compte sandbox réel

La documentation publique Pennylane (pennylane.readme.io) contient plusieurs
inexactitudes par rapport au comportement réel de l'API, corrigées dans le code après
tests contre le sandbox Mollow :

1. **Tri par `date` refusé** sur `/transactions` et `/quotes` (seul `id` est accepté,
   malgré ce qu'indique la doc publique) → `sort` retiré de ces appels
   (`src/lib/finance.ts`).
2. **Filtres booléens** (`draft`, `credit_note` sur `/customer_invoices`) attendent la
   chaîne `"false"`/`"true"`, pas un booléen JSON → corrigé.
3. **Sens du champ `remaining_amount_with_tax`** : positif sur `customer_invoices`,
   mais **négatif** sur `supplier_invoices` pour une facture impayée (ex. `"-4.58"`
   pour une facture de `4.58 €`). Le code prend la valeur absolue pour les factures
   fournisseurs (`getUnpaidSupplierInvoices`).
4. **Champ `amount` des transactions** : positif = encaissement, négatif = décaissement
   — confirmé par les données réelles (courbes de trésorerie et encaissé/dépensé
   cohérentes avec la trésorerie affichée).
5. **Statut « devis envoyé non accepté »** : confirmé sur `status: "pending"` côté API
   (`pending`, `accepted`, `denied`, `invoiced`, `expired`).
6. **`customer_invoices.status`** peut valoir `"upcoming"`, non documenté publiquement.
   Sans incidence : le filtrage se fait uniquement sur `paid` + `draft`/`credit_note`.
7. **Rate limiting (429)** rencontré sur `/transactions` en usage réel (plusieurs pages
   récupérées d'affilée) → retry automatique avec backoff exponentiel (respecte
   `Retry-After` si présent) dans `src/lib/pennylane.ts`.
8. **Catégories analytiques** (`transactions[].categories`) : vides tant qu'aucune
   catégorisation n'est faite dans Pennylane. Une fois catégorisé (groupe « Type de
   dépenses » / « Type de revenus » observés), chaque transaction porte un tableau de
   catégories avec un `weight` (permet un partage entre plusieurs catégories) —
   `getSpendingByCategory` répartit le montant au prorata des poids.

Points restant des approximations assumées (pas des bugs, mais à garder en tête) :

- **Comptes bancaires en devise non-EUR** : non convertis (pas de taux fourni par
  `bank_accounts`), donc exclus du calcul de trésorerie et signalés dans l'UI si
  applicable (`nonEurAccountsCount`).
- **Trésorerie de fin de mois** (courbe 12 mois) : reconstituée en remontant depuis la
  trésorerie actuelle via les transactions bancaires uniquement — indicatif, pas un
  solde comptable exact au centime (n'inclut pas d'éventuels ajustements hors
  transactions bancaires).
- **Burn net moyen** : calculé sur les 6 derniers mois clos par défaut (constante
  `BURN_AVERAGE_MONTHS` dans `src/lib/finance.ts`) — le cahier des charges indique
  "3 à 6 mois", ajustable facilement si besoin.
- Les 3 écrans ont été testés en local avec le token sandbox Mollow : données
  cohérentes entre elles (trésorerie, burn, total factures clients identique entre
  la synthèse et l'écran créances).

## Déploiement (Vercel)

1. Pousser le repo sur GitHub.
2. Importer le projet sur [Vercel](https://vercel.com/new).
3. Renseigner les variables d'environnement `PENNYLANE_API_TOKEN` (token de production)
   et `DASHBOARD_PASSWORD` dans les paramètres du projet Vercel — jamais dans le repo.
