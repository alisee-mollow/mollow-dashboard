# Mollow — Dashboard de suivi financier

Dashboard connecté en direct à l'API Pennylane pour suivre la trésorerie, le burn net,
le runway, les créances clients, les devis en cours et la répartition des dépenses et
revenus par catégorie.

Voir le cahier des charges complet pour le contexte et les objectifs produit (note :
l'écran « Factures fournisseurs » prévu initialement a été retiré à la demande de
Mollow, jugé non utile).

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

- `/` — Vue de synthèse : trésorerie actuelle, burn net du mois, runway estimé,
  factures clients en attente, dépense moyenne mensuelle depuis le 1er janvier
  (toujours sur l'année réelle en cours, indépendamment du sélecteur), courbe de
  trésorerie **avec projection** (pointillés, au rythme du burn net moyen, jusqu'à
  extinction ou 12 mois), encaissé vs dépensé par mois.
- `/creances` — Trois sections : factures clients en attente de paiement (statuts actifs
  uniquement, voir ci-dessous), devis envoyés non acceptés (en attente **+ expirés**),
  et devis acceptés non (entièrement) facturés — avec le montant déjà facturé et le
  restant à facturer, pour anticiper correctement la trésorerie à venir sur les devis
  facturés en plusieurs fois (acompte + solde).
- `/depenses` — Ventilation des dépenses par catégorie analytique Pennylane sur une
  **année civile sélectionnable** (camembert + tableau), basée sur les catégories
  réellement taguées dans Pennylane (groupe « Type de dépenses »). Les transactions
  sans catégorie de ce groupe apparaissent en « Non catégorisé », avec la liste
  détaillée (date, libellé bancaire, montant) pour aller les catégoriser dans
  Pennylane.
- `/revenus` — Même principe côté revenus (groupe « Type de revenus »), complété d'un
  top clients sur l'année sélectionnée (classement par total facturé — payé + en
  attente — hors brouillons et avoirs).

Synthèse, Dépenses et Revenus ont un sélecteur d'année civile (‹ AAAA ›, borné à
`MIN_YEAR` dans `YearSwitcher.tsx`) : les graphiques et ventilations basculent sur
l'année choisie. Les KPI de la Synthèse (trésorerie, burn, runway, dépense moyenne
YTD) restent, eux, toujours calculés sur l'état réel actuel — seule la courbe change
avec l'année affichée.

**Factures clients en attente — statuts actifs uniquement** : le filtre ne se limite
plus à `paid: false`, mais à un statut dans `{upcoming, late, partially_paid}`. Deux
statuts observés en conditions réelles ont `paid: false` sans être de vraies créances :
`archived` (facture classée sans suite, ex. une note de frais mal importée) et
`incomplete` (document mal formé, parfois sans client rattaché) — voir
`ACTIVE_RECEIVABLE_STATUSES` dans `src/lib/finance.ts`.

Le groupe de catégories est retrouvé par libellé, pas par id (qui diffère entre
sandbox et production) — voir `findCategoryGroup` dans `src/lib/finance.ts`.

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
3. **Sens du champ `remaining_amount_with_tax`** : positif sur `customer_invoices`
   pour une facture impayée.
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
   `getBreakdownByCategory` répartit le montant au prorata des poids.
9. **Le top clients (`/revenus`) et la ventilation par catégorie n'ont pas la même
   base** : la ventilation se fait sur les transactions bancaires (encaissements,
   qui peuvent inclure des entrées hors facturation comme un financement), le top
   clients sur les factures clients (`customer_invoices.amount`). Les deux totaux ne
   coïncident donc pas nécessairement — signalé dans l'UI.
10. **Statuts `archived` et `incomplete`** sur `customer_invoices` : `paid: false`
    sans être de vraies créances actives (ex. une note de frais importée par erreur
    comme facture client, ou un document sans client rattaché). Repéré en confrontant
    les factures affichées à la réalité métier (Mollow a signalé 3 lignes non
    pertinentes) — voir point ci-dessus sur `ACTIVE_RECEIVABLE_STATUSES`.
11. **`operator: "in"`** fonctionne sur le filtre `status` de `/quotes`
    (`getOpenQuotes`), malgré l'absence de champs de filtre documentés pour cet
    endpoint dans la doc publique.
12. **`quote_id` est un champ de filtre valide sur `/customer_invoices`**
    (`getUnbilledAcceptedQuotes`), ce qui permet de retrouver les factures déjà
    émises contre un devis donné sans avoir à parser l'URL `linked_invoices` fournie
    par l'objet quote.
13. Certains devis **acceptés sont facturés en plusieurs fois** (acompte + solde) :
    5 des 30 devis non-`invoiced`/`denied` testés en sandbox avaient déjà une
    facture partielle liée, alors que le devis restait au statut `accepted`
    (il ne bascule à `invoiced` qu'une fois entièrement facturé).

Points restant des approximations assumées (pas des bugs, mais à garder en tête) :

- **Comptes bancaires en devise non-EUR** : non convertis (pas de taux fourni par
  `bank_accounts`), donc exclus du calcul de trésorerie et signalés dans l'UI si
  applicable (`nonEurAccountsCount`).
- **Trésorerie de fin de mois** : reconstituée en remontant depuis la trésorerie
  actuelle via les transactions bancaires uniquement, quelle que soit l'année
  affichée (la requête récupère toujours les transactions depuis le 1er janvier de
  l'année choisie jusqu'à aujourd'hui) — indicatif, pas un solde comptable exact au
  centime. Deux appels séparés à un instant différent peuvent donc afficher une
  frontière décembre/janvier légèrement différente si de nouvelles transactions sont
  arrivées entre-temps (constaté en sandbox, où les données de test évoluent en
  continu) — non-problème en production où l'historique est stable.
- **Burn net moyen / projection** : calculés sur les 6 derniers mois clos réels
  (constante `BURN_AVERAGE_MONTHS` dans `src/lib/finance.ts`) — le cahier des charges
  indique "3 à 6 mois", ajustable facilement si besoin. La projection de trésorerie
  prolonge ce rythme sur un horizon d'au plus 12 mois (`MAX_PROJECTION_MONTHS`) ;
  c'est une extrapolation linéaire indicative, pas une prévision.
- Les 4 écrans ont été testés en local avec le token sandbox Mollow : données
  cohérentes entre elles (trésorerie, burn, total factures clients identique entre
  la synthèse et l'écran créances), sélecteur d'année vérifié sur Synthèse/Dépenses/
  Revenus.

## Charte graphique Mollow

Couleurs de marque appliquées via variables CSS (`src/app/globals.css`) : `#590d22`
(burgundy), `#c9184a` (primaire), `#ff4d6d`, `#ff8fa3`, `#ffd6dd` (rose clair),
`#698d85` (sauge), `#f4f4f4` (fond). Utilisées pour la nav, les boutons, les tons des
cartes KPI (positif = sauge, négatif = burgundy/primaire) et les graphiques.

Note d'accessibilité : cette palette est en grande partie une seule famille de teinte
(rose, du foncé au clair) plus une teinte sauge — elle ne passe pas la validation
« palette catégorielle » standard (séparation de teinte insuffisante pour un daltonien
entre les nuances de rose). Pour les camemberts par catégorie, c'est compensé par des
étiquettes directes sur les parts + une légende systématique + le tableau détaillé en
dessous (qui ne dépend jamais de la couleur seule) — voir `CategoryPieChart.tsx`.

## Déploiement (Vercel)

1. Pousser le repo sur GitHub.
2. Importer le projet sur [Vercel](https://vercel.com/new).
3. Renseigner les variables d'environnement `PENNYLANE_API_TOKEN` (token de production)
   et `DASHBOARD_PASSWORD` dans les paramètres du projet Vercel — jamais dans le repo.
