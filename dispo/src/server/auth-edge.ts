/**
 * Der Teil der Anmeldung, der auch in der Edge-Laufzeit funktioniert.
 *
 * Die Middleware laeuft dort und hat weder Datenbank noch Node-Krypto zur
 * Verfuegung. Sie braucht nur den Cookie-Namen – alles Weitere entscheidet
 * der Server.
 */
export const SESSION_COOKIE = 'dispo_session';
