<?php
/**
 * Centro Medico Preite — invio dei moduli del sito
 *
 * Riceve i moduli «Scrivici un messaggio» e «Prenota una visita» (POST da script.js)
 * e li spedisce come email a richieste@centromedicopreite.com con la funzione mail()
 * dell'hosting. Non salva su disco i dati dei moduli e non usa servizi esterni (resta solo,
 * per un'ora, un'impronta (hash) dell'IP per limitare gli invii ripetuti).
 *
 * Requisiti sull'hosting: PHP 7.4 o successivo con l'invio di posta abilitato
 * (Aruba, SiteGround, Register ecc. lo supportano di serie).
 */

declare(strict_types=1);

// gli errori restano nel log dell'hosting: al visitatore non devono mostrare percorsi o dettagli interni
ini_set('display_errors', '0');
ini_set('log_errors', '1');

date_default_timezone_set('Europe/Rome');

/* ---------- Configurazione ---------- */

// casella che riceve le richieste
const DESTINATARIO = 'richieste@centromedicopreite.com';

// mittente tecnico: deve essere un indirizzo del vostro dominio, altrimenti molti provider
// scartano l'email come spam. L'indirizzo di chi scrive viene messo in «Rispondi a».
const MITTENTE = 'noreply@centromedicopreite.com';
const NOME_MITTENTE = 'Sito Centro Medico Preite';

// sotto questo tempo di compilazione (ms) l'invio è quasi certamente automatico
const TEMPO_MINIMO_MS = 2500;

// massimo di invii in un'ora: dallo stesso visitatore e in totale (attacchi da molti indirizzi)
const MAX_INVII = 5;
const MAX_INVII_TOTALI = 30;
const FINESTRA_LIMITE = 3600;

// dimensione massima di un invio: i moduli di testo non arrivano mai a tanto
const MAX_BYTE_RICHIESTA = 32768;

/* ---------- Risposta JSON ---------- */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Cache-Control: no-store');

function rispondi(int $stato, bool $ok, string $errore = ''): void
{
    http_response_code($stato);
    echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $errore], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    rispondi(405, false, 'Metodo non consentito.');
}

// accetta solo invii dal sito stesso (i browser dichiarano sempre l'origine di un POST)
$origine = $_SERVER['HTTP_ORIGIN'] ?? '';
$hostSito = strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '') ?? '');
if ($origine === '' || strtolower((string) parse_url($origine, PHP_URL_HOST)) !== $hostSito) {
    rispondi(403, false, 'Richiesta non consentita.');
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_BYTE_RICHIESTA) {
    rispondi(413, false, 'Il messaggio è troppo lungo.');
}

// ogni campo deve essere un testo semplice in UTF-8 (niente array come name[]=…)
foreach ($_POST as $valore) {
    if (!is_string($valore) || !mb_check_encoding($valore, 'UTF-8')) {
        rispondi(400, false, 'Richiesta non valida.');
    }
}

/* ---------- Lettura e pulizia dei campi ---------- */

// testo su una riga: niente a capo (evita l'iniezione di intestazioni email), lunghezza massima
function riga(string $chiave, int $max): string
{
    $v = trim((string) ($_POST[$chiave] ?? ''));
    $v = preg_replace('/[\x00-\x1F\x7F]+/', ' ', $v) ?? '';
    return mb_substr($v, 0, $max, 'UTF-8');
}

function testo(string $chiave, int $max): string
{
    $v = trim(str_replace("\r\n", "\n", (string) ($_POST[$chiave] ?? '')));
    $v = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]+/', ' ', $v) ?? '';
    return mb_substr($v, 0, $max, 'UTF-8');
}

// nomi di persone, aree e trattamenti: solo lettere e punteggiatura dei nomi, quindi niente link o codice
function sembraNome(string $v): bool
{
    return preg_match("/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u", $v) === 1;
}

// controlli anti-spam: campo trappola compilato o invio troppo rapido → finto successo
if (riga('sito_web', 200) !== '' || (int) ($_POST['ms'] ?? 0) < TEMPO_MINIMO_MS) {
    rispondi(200, true);
}

/* ---------- Limite di invii per visitatore ---------- */

// Per ogni visitatore si tiene solo un'impronta non reversibile dell'IP con gli orari degli ultimi
// invii, cancellata dopo FINESTRA_LIMITE secondi. Se la cartella non è scrivibile il modulo funziona
// comunque, senza limite.
function superaLimite(string $chiave, int $massimo): bool
{
    $cartella = __DIR__ . '/.limiti-invio';
    if (!is_dir($cartella) && !@mkdir($cartella, 0700)) {
        return false;
    }
    $protezione = $cartella . '/.htaccess';
    if (!is_file($protezione)) {
        @file_put_contents($protezione, "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
    }

    $adesso = time();
    foreach (glob($cartella . '/*.txt') ?: [] as $vecchio) {
        if ($adesso - (int) @filemtime($vecchio) > FINESTRA_LIMITE) {
            @unlink($vecchio);
        }
    }

    $file = $cartella . '/' . hash('sha256', $chiave . '|' . __FILE__ . '|' . date('Y-m-d')) . '.txt';
    $f = @fopen($file, 'c+');
    if ($f === false) {
        return false;
    }
    flock($f, LOCK_EX);
    $invii = array_filter(
        array_map('intval', explode("\n", (string) stream_get_contents($f))),
        static fn (int $t): bool => $adesso - $t < FINESTRA_LIMITE
    );
    $superato = count($invii) >= $massimo;
    if (!$superato) {
        $invii[] = $adesso;
    }
    ftruncate($f, 0);
    rewind($f);
    fwrite($f, implode("\n", $invii));
    flock($f, LOCK_UN);
    fclose($f);
    return $superato;
}

$tipo     = riga('tipo', 20);
$nome     = riga('name', 80);
$email    = riga('email', 120);
$telefono = riga('phone', 20);
$privacy  = isset($_POST['privacy']);

if (!in_array($tipo, ['contatto', 'visita'], true)) {
    rispondi(400, false, 'Modulo non riconosciuto.');
}
if (!sembraNome($nome)) {
    rispondi(422, false, 'Indica nome e cognome.');
}
if ($email === '' && $telefono === '') {
    rispondi(422, false, 'Indica almeno un recapito: email o telefono.');
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    rispondi(422, false, "Controlla l'indirizzo email.");
}
if ($telefono !== '' && !preg_match('/^\+?[\d\s.\/()-]{6,20}$/', $telefono)) {
    rispondi(422, false, 'Controlla il numero di telefono.');
}
if (!$privacy) {
    rispondi(422, false, "Conferma di aver preso visione dell'informativa privacy.");
}

/* ---------- Composizione dell'email ---------- */

$righe = [];

if ($tipo === 'visita') {
    $area        = riga('speciality', 60);
    $data        = riga('date', 10);
    $medico      = riga('doctor', 80);
    $trattamento = riga('treatment', 80);

    if (!sembraNome($area) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
        rispondi(422, false, 'Indica area e giorno preferito.');
    }
    if (($medico !== '' && !sembraNome($medico)) || ($trattamento !== '' && !sembraNome($trattamento))) {
        rispondi(400, false, 'Richiesta non valida.');
    }
    $giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    $mesi   = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
               'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    $d = DateTime::createFromFormat('!Y-m-d', $data);
    // data reale (niente 45 del mese 13) e non già passata
    if (!$d || $d->format('Y-m-d') !== $data || $data < date('Y-m-d')) {
        rispondi(422, false, 'Controlla il giorno preferito.');
    }
    if ((int) $d->format('w') === 0) {
        rispondi(422, false, 'La domenica il centro è chiuso: scegli un altro giorno.');
    }
    $dataLeggibile = $giorni[(int) $d->format('w')] . ' ' . $d->format('j') . ' ' . $mesi[(int) $d->format('n')] . ' ' . $d->format('Y');

    $oggetto = 'Richiesta di visita dal sito';
    $righe[] = 'Nuova richiesta di visita dal sito.';
    $righe[] = '';
    $righe[] = 'Nome e cognome: ' . $nome;
    $righe[] = 'Email: ' . ($email !== '' ? $email : '—');
    $righe[] = 'Telefono: ' . ($telefono !== '' ? $telefono : '—');
    $righe[] = 'Area: ' . $area;
    if ($medico !== '') {
        $righe[] = 'Professionista: ' . $medico;
    }
    if ($trattamento !== '') {
        $righe[] = 'Trattamento di interesse: ' . $trattamento;
    }
    $righe[] = 'Giorno preferito: ' . $dataLeggibile;
} else {
    $messaggio = testo('message', 1000);
    if ($messaggio === '') {
        rispondi(422, false, 'Scrivi il tuo messaggio.');
    }
    $oggetto = 'Richiesta di informazioni dal sito';
    $righe[] = 'Nuovo messaggio dal sito.';
    $righe[] = '';
    $righe[] = 'Nome e cognome: ' . $nome;
    $righe[] = 'Email: ' . ($email !== '' ? $email : '—');
    $righe[] = 'Telefono: ' . ($telefono !== '' ? $telefono : '—');
    $righe[] = '';
    $righe[] = 'Messaggio:';
    $righe[] = $messaggio;
}

$righe[] = '';
$righe[] = '—';
$righe[] = "L'utente ha confermato di aver preso visione dell'informativa privacy.";
$righe[] = 'Inviato il ' . date('d/m/Y \a\l\l\e H:i') . '.';

$corpo = quoted_printable_encode(implode("\r\n", $righe));

$intestazioni = [
    'From: ' . mb_encode_mimeheader(NOME_MITTENTE, 'UTF-8') . ' <' . MITTENTE . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable', // rispetta il limite di lunghezza delle righe
    'X-Mailer: Centro Medico Preite',
];
if ($email !== '') {
    // «Rispondi» nella casella del centro scrive direttamente a chi ha compilato il modulo
    $intestazioni[] = 'Reply-To: ' . $email;
}

// contati solo gli invii validi: gli errori di compilazione non consumano i tentativi
if (superaLimite('ip|' . ($_SERVER['REMOTE_ADDR'] ?? ''), MAX_INVII) || superaLimite('totale', MAX_INVII_TOTALI)) {
    rispondi(429, false, 'Hai inviato troppe richieste ravvicinate.');
}

$inviata = mail(
    DESTINATARIO,
    mb_encode_mimeheader($oggetto, 'UTF-8'),
    $corpo,
    implode("\r\n", $intestazioni),
    '-f' . MITTENTE
);

if (!$inviata) {
    error_log('invia.php: la funzione mail() non è riuscita a spedire'); // senza dati del visitatore
    rispondi(500, false, 'Invio non riuscito.');
}
rispondi(200, true);
