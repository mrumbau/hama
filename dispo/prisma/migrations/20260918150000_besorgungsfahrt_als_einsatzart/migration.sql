-- Besorgungsfahrt als Einsatzart auf der Baustelle.
--
-- Eine Besorgungsfahrt geht immer FUER eine Baustelle, nicht statt einer:
-- Jemand holt etwas und bringt es hin. Als eigene Zeile in der
-- Baustellenansicht waere sie eine Baustelle ohne Ziel - deshalb dort eine
-- Einsatzart, und die eigene Zeile nur noch in der Ressourcenansicht, wo
-- man sieht, wer gerade unterwegs ist.
ALTER TYPE "AssignmentKind" ADD VALUE IF NOT EXISTS 'BESORGUNGSFAHRT';
