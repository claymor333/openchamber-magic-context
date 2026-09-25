import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountBadge, mountButton, mountTabs } from '@openchamber/sdk/ui';
import {
  isCurrentSessionRefresh,
  parseEventPage,
  parseDiagnosticsResponse,
  preserveLastGoodEvents,
  type CacheCause,
  type CacheEvent,
  type DiagnosticsResponse,
  type EventPageDto,
  type LiveSidebar,
  type ProviderStatus,
  type SessionRefreshStamp,
  type SourceState,
  type StreamEvent,
} from '../shared.js';

type CopyKey =
  | 'subtitle' | 'sidebar' | 'diagnostics' | 'refresh' | 'refreshing' | 'connected' | 'partial' | 'unavailable'
  | 'noSession' | 'currentSession' | 'context' | 'usageUnavailable' | 'liveBreakdownUnavailable' | 'system'
  | 'conversation' | 'memories' | 'toolCalls' | 'toolDefinitions' | 'historian' | 'compartments' | 'memorySection'
  | 'storedMemories' | 'statusSection' | 'queuedOperations' | 'sessionNotes' | 'dreamer' | 'liveStatusUnavailable' | 'stats'
  | 'lastInputTokens' | 'cacheTimeline' | 'streamLog' | 'cacheRead' | 'cacheWrite' | 'hitRatio' | 'cause'
  | 'noCacheEvents' | 'noStreamEvents' | 'databaseMissing' | 'schemaPartial' | 'sqliteUnsupported' | 'logMissing'
  | 'readFailure' | 'dataSourceNote' | 'remoteNote' | 'updatedAt' | 'level' | 'input' | 'total' | 'lastKnown'
  | 'emergency' | 'threshold' | 'materialized' | 'compaction' | 'cacheCause' | 'unknownCause' | 'cacheCategory'
  | 'streamCategory' | 'historianCategory' | 'dreamerCategory' | 'transformCategory' | 'progress' | 'running' | 'idle' | 'transformError';

type Locale = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'ko' | 'pl' | 'pt-BR' | 'tr' | 'uk' | 'zh-CN' | 'zh-TW';
type Copy = Record<CopyKey, string>;
type PanelStatus = { label: string; tone: 'neutral' | 'success' | 'warning' | 'error' };
type DiagnosticsQuery = { directory?: string; sessionId?: string };

const messages = {
  en: {
    subtitle: 'OpenCode context', sidebar: 'Sidebar', diagnostics: 'Diagnostics', refresh: 'Refresh', refreshing: 'Refreshing',
    connected: 'Connected', partial: 'Partial data', unavailable: 'Unavailable', running: 'Running', idle: 'Idle', noSession: 'No active session',
    currentSession: 'Current session', context: 'Context', usageUnavailable: 'Saved context usage is unavailable.',
    liveBreakdownUnavailable: 'Live components require a compatible local Magic Context RPC.', system: 'System',
    conversation: 'Conversation', memories: 'Memories', toolCalls: 'Tool calls', toolDefinitions: 'Tool definitions',
    historian: 'Historian', compartments: 'Compartments', memorySection: 'Memory', storedMemories: 'Stored memories',
    statusSection: 'Status', queuedOperations: 'Queued operations', sessionNotes: 'Session notes', dreamer: 'Dreamer',
    liveStatusUnavailable: 'Live module status requires a compatible local Magic Context RPC.', stats: 'Stats',
    lastInputTokens: 'Last input tokens', cacheTimeline: 'Cache timeline', streamLog: 'Stream and plugin log',
    cacheRead: 'Cache read', cacheWrite: 'Cache write', hitRatio: 'Hit ratio', cause: 'Cause',
    noCacheEvents: 'No cache events were found for this session.', noStreamEvents: 'No matching log events were found.',
    databaseMissing: 'A configured Magic Context or OpenCode database could not be found.',
    schemaPartial: 'The database opened, but this version does not contain all expected tables.',
    sqliteUnsupported: 'SQLite diagnostics are unavailable in this OpenChamber runtime.',
    logMissing: 'The configured Magic Context log could not be found.',
    readFailure: 'Could not read diagnostics. Existing values are kept until a complete refresh succeeds.',
    dataSourceNote: 'Read-only snapshots. The private Magic Context RPC may change; cache data refreshes every 15 seconds and log events every 3 seconds while Diagnostics is open.',
    remoteNote: 'These files are on the OpenChamber server, not necessarily this device.', updatedAt: 'Updated',
    level: 'Level', input: 'Input', total: 'Total', lastKnown: 'Showing the last successful diagnostics snapshot.',
    emergency: 'Emergency', threshold: 'Threshold', materialized: 'Materialized', compaction: 'Compaction',
    cacheCause: 'Cache decision', unknownCause: 'Other decision', cacheCategory: 'Cache', streamCategory: 'Stream event',
    historianCategory: 'Historian', dreamerCategory: 'Dreamer', transformCategory: 'Transform', progress: 'Progress', transformError: 'Error detected',
  },
  es: {
    subtitle: 'Contexto de OpenCode', sidebar: 'Barra lateral', diagnostics: 'Diagnósticos', refresh: 'Actualizar', refreshing: 'Actualizando',
    connected: 'Conectado', partial: 'Datos parciales', unavailable: 'No disponible', running: 'En ejecución', idle: 'Inactivo', noSession: 'No hay una sesión activa',
    currentSession: 'Sesión actual', context: 'Contexto', usageUnavailable: 'El uso guardado del contexto no está disponible.',
    liveBreakdownUnavailable: 'Los componentes en vivo requieren una RPC local de Magic Context compatible.', system: 'Sistema',
    conversation: 'Conversación', memories: 'Memorias', toolCalls: 'Llamadas a herramientas', toolDefinitions: 'Definiciones de herramientas',
    historian: 'Historial', compartments: 'Segmentos', memorySection: 'Memoria', storedMemories: 'Memorias guardadas',
    statusSection: 'Estado', queuedOperations: 'Operaciones en cola', sessionNotes: 'Notas de sesión', dreamer: 'Dreamer',
    liveStatusUnavailable: 'El estado de los módulos requiere una RPC local de Magic Context compatible.', stats: 'Estadísticas',
    lastInputTokens: 'Últimos tokens de entrada', cacheTimeline: 'Cronología de caché', streamLog: 'Registro del flujo y del plugin',
    cacheRead: 'Lectura de caché', cacheWrite: 'Escritura de caché', hitRatio: 'Tasa de aciertos', cause: 'Causa',
    noCacheEvents: 'No se encontraron eventos de caché para esta sesión.', noStreamEvents: 'No se encontraron eventos coincidentes en el registro.',
    databaseMissing: 'No se encontró una base de datos configurada de Magic Context u OpenCode.',
    schemaPartial: 'La base de datos se abrió, pero esta versión no contiene todas las tablas esperadas.',
    sqliteUnsupported: 'SQLite no está disponible en este entorno de OpenChamber.',
    logMissing: 'No se encontró el registro de Magic Context configurado.',
    readFailure: 'No se pudieron leer los diagnósticos. Se conservan los valores hasta que se complete una actualización.',
    dataSourceNote: 'Instantáneas de solo lectura. La RPC privada de Magic Context puede cambiar; la caché se actualiza cada 15 s y los eventos del registro cada 3 s mientras Diagnósticos está abierto.',
    remoteNote: 'Estos archivos están en el servidor de OpenChamber, no necesariamente en este dispositivo.', updatedAt: 'Actualizado',
    level: 'Nivel', input: 'Entrada', total: 'Total', lastKnown: 'Se muestra la última captura correcta de los diagnósticos.',
    emergency: 'Emergencia', threshold: 'Umbral', materialized: 'Materializado', compaction: 'Compactación',
    cacheCause: 'Decisión de caché', unknownCause: 'Otra decisión', cacheCategory: 'Caché', streamCategory: 'Evento del flujo',
    historianCategory: 'Historial', dreamerCategory: 'Dreamer', transformCategory: 'Transformación', progress: 'Progreso', transformError: 'Error detectado',
  },
  fr: {
    subtitle: 'Contexte OpenCode', sidebar: 'Volet latéral', diagnostics: 'Diagnostics', refresh: 'Actualiser', refreshing: 'Actualisation',
    connected: 'Connecté', partial: 'Données partielles', unavailable: 'Indisponible', running: 'En cours', idle: 'Inactif', noSession: 'Aucune session active',
    currentSession: 'Session actuelle', context: 'Contexte', usageUnavailable: 'L’utilisation enregistrée du contexte est indisponible.',
    liveBreakdownUnavailable: 'Les composants en direct nécessitent une RPC locale Magic Context compatible.', system: 'Système',
    conversation: 'Conversation', memories: 'Mémoires', toolCalls: 'Appels d’outils', toolDefinitions: 'Définitions des outils',
    historian: 'Historique', compartments: 'Compartiments', memorySection: 'Mémoire', storedMemories: 'Mémoires stockées',
    statusSection: 'État', queuedOperations: 'Opérations en attente', sessionNotes: 'Notes de session', dreamer: 'Dreamer',
    liveStatusUnavailable: 'L’état des modules nécessite une RPC locale Magic Context compatible.', stats: 'Statistiques',
    lastInputTokens: 'Derniers jetons d’entrée', cacheTimeline: 'Chronologie du cache', streamLog: 'Journal du flux et du plugin',
    cacheRead: 'Lecture du cache', cacheWrite: 'Écriture du cache', hitRatio: 'Taux de réussite', cause: 'Cause',
    noCacheEvents: 'Aucun événement de cache pour cette session.', noStreamEvents: 'Aucun événement de journal correspondant.',
    databaseMissing: 'Aucune base Magic Context ou OpenCode configurée n’a été trouvée.',
    schemaPartial: 'La base s’est ouverte, mais cette version ne contient pas toutes les tables attendues.',
    sqliteUnsupported: 'Les diagnostics SQLite sont indisponibles dans cette version d’OpenChamber.',
    logMissing: 'Le journal Magic Context configuré est introuvable.',
    readFailure: 'Lecture des diagnostics impossible. Les valeurs existantes sont conservées jusqu’à une actualisation complète.',
    dataSourceNote: 'Instantanés en lecture seule. La RPC privée Magic Context peut changer ; le cache est actualisé toutes les 15 s et les événements du journal toutes les 3 s lorsque Diagnostics est ouvert.',
    remoteNote: 'Ces fichiers se trouvent sur le serveur OpenChamber, pas forcément sur cet appareil.', updatedAt: 'Actualisé',
    level: 'Niveau', input: 'Entrée', total: 'Total', lastKnown: 'Dernier instantané de diagnostics réussi affiché.',
    emergency: 'Urgence', threshold: 'Seuil', materialized: 'Matérialisé', compaction: 'Compaction',
    cacheCause: 'Décision du cache', unknownCause: 'Autre décision', cacheCategory: 'Cache', streamCategory: 'Événement du flux',
    historianCategory: 'Historique', dreamerCategory: 'Dreamer', transformCategory: 'Transformation', progress: 'Progression', transformError: 'Erreur détectée',
  },
  de: {
    subtitle: 'OpenCode-Kontext', sidebar: 'Seitenleiste', diagnostics: 'Diagnose', refresh: 'Aktualisieren', refreshing: 'Wird aktualisiert',
    connected: 'Verbunden', partial: 'Teilweise Daten', unavailable: 'Nicht verfügbar', running: 'Läuft', idle: 'Inaktiv', noSession: 'Keine aktive Sitzung',
    currentSession: 'Aktuelle Sitzung', context: 'Kontext', usageUnavailable: 'Gespeicherte Kontextnutzung ist nicht verfügbar.',
    liveBreakdownUnavailable: 'Live-Komponenten erfordern eine kompatible lokale Magic-Context-RPC.', system: 'System',
    conversation: 'Unterhaltung', memories: 'Erinnerungen', toolCalls: 'Tool-Aufrufe', toolDefinitions: 'Tool-Definitionen',
    historian: 'Historie', compartments: 'Kompartimente', memorySection: 'Speicher', storedMemories: 'Gespeicherte Erinnerungen',
    statusSection: 'Status', queuedOperations: 'Vorgänge in der Warteschlange', sessionNotes: 'Sitzungsnotizen', dreamer: 'Dreamer',
    liveStatusUnavailable: 'Der Live-Modulstatus erfordert eine kompatible lokale Magic-Context-RPC.', stats: 'Statistik',
    lastInputTokens: 'Letzte Eingabetokens', cacheTimeline: 'Cache-Zeitachse', streamLog: 'Stream- und Plugin-Protokoll',
    cacheRead: 'Cache-Lesezugriffe', cacheWrite: 'Cache-Schreibzugriffe', hitRatio: 'Trefferquote', cause: 'Ursache',
    noCacheEvents: 'Für diese Sitzung wurden keine Cache-Ereignisse gefunden.', noStreamEvents: 'Keine passenden Protokollereignisse gefunden.',
    databaseMissing: 'Keine konfigurierte Magic-Context- oder OpenCode-Datenbank gefunden.',
    schemaPartial: 'Die Datenbank wurde geöffnet, enthält in dieser Version aber nicht alle erwarteten Tabellen.',
    sqliteUnsupported: 'SQLite-Diagnose ist in dieser OpenChamber-Laufzeit nicht verfügbar.',
    logMissing: 'Das konfigurierte Magic-Context-Protokoll wurde nicht gefunden.',
    readFailure: 'Diagnosedaten konnten nicht gelesen werden. Vorhandene Werte bleiben bis zur erfolgreichen Aktualisierung erhalten.',
    dataSourceNote: 'Nur-Lese-Snapshots. Die private Magic-Context-RPC kann sich ändern; Cache-Daten werden alle 15 s und Protokollereignisse bei geöffneten Diagnosen alle 3 s aktualisiert.',
    remoteNote: 'Diese Dateien liegen auf dem OpenChamber-Server, nicht zwingend auf diesem Gerät.', updatedAt: 'Aktualisiert',
    level: 'Stufe', input: 'Eingabe', total: 'Gesamt', lastKnown: 'Der letzte erfolgreiche Diagnose-Snapshot wird angezeigt.',
    emergency: 'Notfall', threshold: 'Schwellenwert', materialized: 'Materialisiert', compaction: 'Komprimierung',
    cacheCause: 'Cache-Entscheidung', unknownCause: 'Andere Entscheidung', cacheCategory: 'Cache', streamCategory: 'Stream-Ereignis',
    historianCategory: 'Historie', dreamerCategory: 'Dreamer', transformCategory: 'Transformation', progress: 'Fortschritt', transformError: 'Fehler erkannt',
  },
  ja: {
    subtitle: 'OpenCode コンテキスト', sidebar: 'サイドバー', diagnostics: '診断', refresh: '更新', refreshing: '更新中',
    connected: '接続済み', partial: '一部のデータ', unavailable: '利用できません', running: '実行中', idle: '待機中', noSession: 'アクティブなセッションはありません',
    currentSession: '現在のセッション', context: 'コンテキスト', usageUnavailable: '保存されたコンテキスト使用量を利用できません。',
    liveBreakdownUnavailable: 'ライブ構成には互換性のあるローカル Magic Context RPC が必要です。', system: 'システム',
    conversation: '会話', memories: 'メモリ', toolCalls: 'ツール呼び出し', toolDefinitions: 'ツール定義',
    historian: '履歴管理', compartments: 'コンパートメント', memorySection: 'メモリ', storedMemories: '保存済みメモリ',
    statusSection: '状態', queuedOperations: 'キュー内の操作', sessionNotes: 'セッションノート', dreamer: 'Dreamer',
    liveStatusUnavailable: 'モジュールのライブ状態には互換性のあるローカル Magic Context RPC が必要です。', stats: '統計',
    lastInputTokens: '直近の入力トークン', cacheTimeline: 'キャッシュのタイムライン', streamLog: 'ストリームとプラグインのログ',
    cacheRead: 'キャッシュ読み取り', cacheWrite: 'キャッシュ書き込み', hitRatio: 'ヒット率', cause: '原因',
    noCacheEvents: 'このセッションのキャッシュイベントはありません。', noStreamEvents: '一致するログイベントはありません。',
    databaseMissing: '設定された Magic Context または OpenCode データベースが見つかりません。',
    schemaPartial: 'データベースは開きましたが、このバージョンには必要なテーブルがすべてありません。',
    sqliteUnsupported: 'この OpenChamber ランタイムでは SQLite 診断を利用できません。',
    logMissing: '設定された Magic Context ログが見つかりません。',
    readFailure: '診断を読み取れませんでした。更新に成功するまで既存の値を保持します。',
    dataSourceNote: '読み取り専用スナップショットです。非公開の Magic Context RPC は変更される可能性があります。キャッシュは15秒ごと、診断タブを開いている間のログイベントは3秒ごとに更新します。',
    remoteNote: 'これらのファイルは OpenChamber サーバー上にあり、この端末上とは限りません。', updatedAt: '更新',
    level: 'レベル', input: '入力', total: '合計', lastKnown: '最後に成功した診断スナップショットを表示しています。',
    emergency: '緊急', threshold: 'しきい値', materialized: '具体化', compaction: '圧縮',
    cacheCause: 'キャッシュ判定', unknownCause: 'その他の判定', cacheCategory: 'キャッシュ', streamCategory: 'ストリームイベント',
    historianCategory: '履歴管理', dreamerCategory: 'Dreamer', transformCategory: '変換', progress: '進行状況', transformError: 'エラーを検出',
  },
  ko: {
    subtitle: 'OpenCode 컨텍스트', sidebar: '사이드바', diagnostics: '진단', refresh: '새로고침', refreshing: '새로고침 중',
    connected: '연결됨', partial: '일부 데이터', unavailable: '사용할 수 없음', running: '실행 중', idle: '대기 중', noSession: '활성 세션이 없습니다',
    currentSession: '현재 세션', context: '컨텍스트', usageUnavailable: '저장된 컨텍스트 사용량을 사용할 수 없습니다.',
    liveBreakdownUnavailable: '실시간 구성 요소에는 호환되는 로컬 Magic Context RPC가 필요합니다.', system: '시스템',
    conversation: '대화', memories: '메모리', toolCalls: '도구 호출', toolDefinitions: '도구 정의',
    historian: '히스토리언', compartments: '구획', memorySection: '메모리', storedMemories: '저장된 메모리',
    statusSection: '상태', queuedOperations: '대기 중인 작업', sessionNotes: '세션 노트', dreamer: 'Dreamer',
    liveStatusUnavailable: '모듈 실시간 상태에는 호환되는 로컬 Magic Context RPC가 필요합니다.', stats: '통계',
    lastInputTokens: '최근 입력 토큰', cacheTimeline: '캐시 타임라인', streamLog: '스트림 및 플러그인 로그',
    cacheRead: '캐시 읽기', cacheWrite: '캐시 쓰기', hitRatio: '적중률', cause: '원인',
    noCacheEvents: '이 세션의 캐시 이벤트가 없습니다.', noStreamEvents: '일치하는 로그 이벤트가 없습니다.',
    databaseMissing: '설정된 Magic Context 또는 OpenCode 데이터베이스를 찾을 수 없습니다.',
    schemaPartial: '데이터베이스를 열었지만 이 버전에는 예상한 테이블이 모두 없습니다.',
    sqliteUnsupported: '이 OpenChamber 런타임에서는 SQLite 진단을 사용할 수 없습니다.',
    logMissing: '설정된 Magic Context 로그를 찾을 수 없습니다.',
    readFailure: '진단을 읽지 못했습니다. 새로고침이 완료될 때까지 기존 값을 유지합니다.',
    dataSourceNote: '읽기 전용 스냅샷입니다. 비공개 Magic Context RPC는 변경될 수 있습니다. 캐시는 15초마다, 진단 탭을 여는 동안 로그 이벤트는 3초마다 새로고침됩니다.',
    remoteNote: '이 파일은 이 기기가 아니라 OpenChamber 서버에 있을 수 있습니다.', updatedAt: '업데이트',
    level: '수준', input: '입력', total: '합계', lastKnown: '마지막으로 성공한 진단 스냅샷을 표시합니다.',
    emergency: '긴급', threshold: '임계값', materialized: '구체화됨', compaction: '압축',
    cacheCause: '캐시 결정', unknownCause: '기타 결정', cacheCategory: '캐시', streamCategory: '스트림 이벤트',
    historianCategory: '히스토리언', dreamerCategory: 'Dreamer', transformCategory: '변환', progress: '진행 상황', transformError: '오류 감지됨',
  },
  pl: {
    subtitle: 'Kontekst OpenCode', sidebar: 'Panel boczny', diagnostics: 'Diagnostyka', refresh: 'Odśwież', refreshing: 'Odświeżanie',
    connected: 'Połączono', partial: 'Częściowe dane', unavailable: 'Niedostępne', running: 'Działa', idle: 'Bezczynny', noSession: 'Brak aktywnej sesji',
    currentSession: 'Bieżąca sesja', context: 'Kontekst', usageUnavailable: 'Zapisane użycie kontekstu jest niedostępne.',
    liveBreakdownUnavailable: 'Dane komponentów na żywo wymagają zgodnego lokalnego RPC Magic Context.', system: 'System',
    conversation: 'Rozmowa', memories: 'Wspomnienia', toolCalls: 'Wywołania narzędzi', toolDefinitions: 'Definicje narzędzi',
    historian: 'Historian', compartments: 'Segmenty', memorySection: 'Pamięć', storedMemories: 'Zapisane wspomnienia',
    statusSection: 'Stan', queuedOperations: 'Operacje w kolejce', sessionNotes: 'Notatki sesji', dreamer: 'Dreamer',
    liveStatusUnavailable: 'Bieżący stan modułów wymaga zgodnego lokalnego RPC Magic Context.', stats: 'Statystyki',
    lastInputTokens: 'Ostatnie tokeny wejściowe', cacheTimeline: 'Oś czasu pamięci podręcznej', streamLog: 'Dziennik strumienia i wtyczki',
    cacheRead: 'Odczyt z pamięci podręcznej', cacheWrite: 'Zapis do pamięci podręcznej', hitRatio: 'Współczynnik trafień', cause: 'Przyczyna',
    noCacheEvents: 'Nie znaleziono zdarzeń pamięci podręcznej dla tej sesji.', noStreamEvents: 'Nie znaleziono pasujących zdarzeń dziennika.',
    databaseMissing: 'Nie znaleziono skonfigurowanej bazy Magic Context ani OpenCode.',
    schemaPartial: 'Baza została otwarta, ale ta wersja nie zawiera wszystkich oczekiwanych tabel.',
    sqliteUnsupported: 'Diagnostyka SQLite jest niedostępna w tym środowisku OpenChamber.',
    logMissing: 'Nie znaleziono skonfigurowanego dziennika Magic Context.',
    readFailure: 'Nie można odczytać diagnostyki. Poprzednie wartości zostaną zachowane do udanego odświeżenia.',
    dataSourceNote: 'Migawki tylko do odczytu. Prywatne RPC Magic Context może się zmienić; pamięć podręczna odświeża się co 15 s, a zdarzenia dziennika co 3 s przy otwartej karcie Diagnostyka.',
    remoteNote: 'Te pliki znajdują się na serwerze OpenChamber, niekoniecznie na tym urządzeniu.', updatedAt: 'Zaktualizowano',
    level: 'Poziom', input: 'Wejście', total: 'Łącznie', lastKnown: 'Wyświetlana jest ostatnia poprawna migawka diagnostyczna.',
    emergency: 'Awaryjne', threshold: 'Próg', materialized: 'Zmaterializowane', compaction: 'Kompaktowanie',
    cacheCause: 'Decyzja pamięci podręcznej', unknownCause: 'Inna decyzja', cacheCategory: 'Pamięć podręczna', streamCategory: 'Zdarzenie strumienia',
    historianCategory: 'Historian', dreamerCategory: 'Dreamer', transformCategory: 'Transformacja', progress: 'Postęp', transformError: 'Wykryto błąd',
  },
  'pt-BR': {
    subtitle: 'Contexto do OpenCode', sidebar: 'Barra lateral', diagnostics: 'Diagnósticos', refresh: 'Atualizar', refreshing: 'Atualizando',
    connected: 'Conectado', partial: 'Dados parciais', unavailable: 'Indisponível', running: 'Em execução', idle: 'Ocioso', noSession: 'Nenhuma sessão ativa',
    currentSession: 'Sessão atual', context: 'Contexto', usageUnavailable: 'O uso salvo do contexto não está disponível.',
    liveBreakdownUnavailable: 'Os componentes em tempo real exigem uma RPC local compatível do Magic Context.', system: 'Sistema',
    conversation: 'Conversa', memories: 'Memórias', toolCalls: 'Chamadas de ferramentas', toolDefinitions: 'Definições de ferramentas',
    historian: 'Histórico', compartments: 'Compartimentos', memorySection: 'Memória', storedMemories: 'Memórias salvas',
    statusSection: 'Status', queuedOperations: 'Operações na fila', sessionNotes: 'Notas da sessão', dreamer: 'Dreamer',
    liveStatusUnavailable: 'O status dos módulos exige uma RPC local compatível do Magic Context.', stats: 'Estatísticas',
    lastInputTokens: 'Últimos tokens de entrada', cacheTimeline: 'Linha do tempo do cache', streamLog: 'Log do fluxo e do plugin',
    cacheRead: 'Leitura do cache', cacheWrite: 'Gravação no cache', hitRatio: 'Taxa de acerto', cause: 'Causa',
    noCacheEvents: 'Nenhum evento de cache foi encontrado para esta sessão.', noStreamEvents: 'Nenhum evento correspondente foi encontrado no log.',
    databaseMissing: 'Nenhum banco configurado do Magic Context ou OpenCode foi encontrado.',
    schemaPartial: 'O banco foi aberto, mas esta versão não contém todas as tabelas esperadas.',
    sqliteUnsupported: 'Os diagnósticos SQLite não estão disponíveis neste runtime do OpenChamber.',
    logMissing: 'O log configurado do Magic Context não foi encontrado.',
    readFailure: 'Não foi possível ler os diagnósticos. Os valores existentes serão mantidos até uma atualização completa.',
    dataSourceNote: 'Instantâneos somente leitura. A RPC privada do Magic Context pode mudar; o cache atualiza a cada 15 s e os eventos do log a cada 3 s enquanto Diagnósticos estiver aberto.',
    remoteNote: 'Esses arquivos ficam no servidor OpenChamber, não necessariamente neste dispositivo.', updatedAt: 'Atualizado',
    level: 'Nível', input: 'Entrada', total: 'Total', lastKnown: 'Exibindo o último instantâneo de diagnóstico bem-sucedido.',
    emergency: 'Emergência', threshold: 'Limite', materialized: 'Materializado', compaction: 'Compactação',
    cacheCause: 'Decisão do cache', unknownCause: 'Outra decisão', cacheCategory: 'Cache', streamCategory: 'Evento do fluxo',
    historianCategory: 'Histórico', dreamerCategory: 'Dreamer', transformCategory: 'Transformação', progress: 'Progresso', transformError: 'Erro detectado',
  },
  tr: {
    subtitle: 'OpenCode bağlamı', sidebar: 'Kenar çubuğu', diagnostics: 'Tanılama', refresh: 'Yenile', refreshing: 'Yenileniyor',
    connected: 'Bağlandı', partial: 'Kısmi veri', unavailable: 'Kullanılamıyor', running: 'Çalışıyor', idle: 'Boşta', noSession: 'Etkin oturum yok',
    currentSession: 'Geçerli oturum', context: 'Bağlam', usageUnavailable: 'Kaydedilmiş bağlam kullanımı kullanılamıyor.',
    liveBreakdownUnavailable: 'Canlı bileşenler için uyumlu bir yerel Magic Context RPC gerekir.', system: 'Sistem',
    conversation: 'Konuşma', memories: 'Anılar', toolCalls: 'Araç çağrıları', toolDefinitions: 'Araç tanımları',
    historian: 'Geçmiş', compartments: 'Bölümler', memorySection: 'Bellek', storedMemories: 'Kaydedilmiş anılar',
    statusSection: 'Durum', queuedOperations: 'Kuyruktaki işlemler', sessionNotes: 'Oturum notları', dreamer: 'Dreamer',
    liveStatusUnavailable: 'Modül canlı durumu için uyumlu bir yerel Magic Context RPC gerekir.', stats: 'İstatistikler',
    lastInputTokens: 'Son giriş belirteçleri', cacheTimeline: 'Önbellek zaman çizelgesi', streamLog: 'Akış ve eklenti günlüğü',
    cacheRead: 'Önbellek okuma', cacheWrite: 'Önbellek yazma', hitRatio: 'İsabet oranı', cause: 'Neden',
    noCacheEvents: 'Bu oturum için önbellek olayı bulunamadı.', noStreamEvents: 'Eşleşen günlük olayı bulunamadı.',
    databaseMissing: 'Yapılandırılmış Magic Context veya OpenCode veritabanı bulunamadı.',
    schemaPartial: 'Veritabanı açıldı ancak bu sürümde beklenen tüm tablolar bulunmuyor.',
    sqliteUnsupported: 'Bu OpenChamber çalışma ortamında SQLite tanılaması kullanılamıyor.',
    logMissing: 'Yapılandırılmış Magic Context günlüğü bulunamadı.',
    readFailure: 'Tanılama okunamadı. Tam yenileme başarılı olana kadar mevcut değerler korunur.',
    dataSourceNote: 'Salt okunur anlık görüntüler. Özel Magic Context RPC değişebilir; önbellek 15 saniyede, Tanılama açıkken günlük olayları 3 saniyede yenilenir.',
    remoteNote: 'Bu dosyalar bu cihazda değil, OpenChamber sunucusunda olabilir.', updatedAt: 'Güncellendi',
    level: 'Düzey', input: 'Girdi', total: 'Toplam', lastKnown: 'Son başarılı tanılama anlık görüntüsü gösteriliyor.',
    emergency: 'Acil', threshold: 'Eşik', materialized: 'Gerçekleştirildi', compaction: 'Sıkıştırma',
    cacheCause: 'Önbellek kararı', unknownCause: 'Diğer karar', cacheCategory: 'Önbellek', streamCategory: 'Akış olayı',
    historianCategory: 'Geçmiş', dreamerCategory: 'Dreamer', transformCategory: 'Dönüştürme', progress: 'İlerleme', transformError: 'Hata algılandı',
  },
  uk: {
    subtitle: 'Контекст OpenCode', sidebar: 'Бічна панель', diagnostics: 'Діагностика', refresh: 'Оновити', refreshing: 'Оновлення',
    connected: 'Підключено', partial: 'Часткові дані', unavailable: 'Недоступно', running: 'Виконується', idle: 'Неактивний', noSession: 'Немає активної сесії',
    currentSession: 'Поточна сесія', context: 'Контекст', usageUnavailable: 'Збережене використання контексту недоступне.',
    liveBreakdownUnavailable: 'Для поточних компонентів потрібен сумісний локальний RPC Magic Context.', system: 'Система',
    conversation: 'Розмова', memories: 'Спогади', toolCalls: 'Виклики інструментів', toolDefinitions: 'Визначення інструментів',
    historian: 'Історія', compartments: 'Сегменти', memorySection: 'Пам’ять', storedMemories: 'Збережені спогади',
    statusSection: 'Стан', queuedOperations: 'Операції в черзі', sessionNotes: 'Нотатки сеансу', dreamer: 'Dreamer',
    liveStatusUnavailable: 'Для поточного стану модулів потрібен сумісний локальний RPC Magic Context.', stats: 'Статистика',
    lastInputTokens: 'Останні вхідні токени', cacheTimeline: 'Хронологія кешу', streamLog: 'Журнал потоку й плагіна',
    cacheRead: 'Читання кешу', cacheWrite: 'Запис кешу', hitRatio: 'Частка влучань', cause: 'Причина',
    noCacheEvents: 'Для цієї сесії подій кешу не знайдено.', noStreamEvents: 'Відповідних подій у журналі не знайдено.',
    databaseMissing: 'Налаштовану базу Magic Context або OpenCode не знайдено.',
    schemaPartial: 'Базу відкрито, але в цій версії немає всіх очікуваних таблиць.',
    sqliteUnsupported: 'Діагностика SQLite недоступна в цьому середовищі OpenChamber.',
    logMissing: 'Налаштований журнал Magic Context не знайдено.',
    readFailure: 'Не вдалося прочитати діагностику. Попередні значення збережено до успішного оновлення.',
    dataSourceNote: 'Знімки доступні лише для читання. Приватний RPC Magic Context може змінитися; кеш оновлюється кожні 15 с, події журналу — кожні 3 с, коли відкрито Діагностику.',
    remoteNote: 'Ці файли розташовані на сервері OpenChamber, не обов’язково на цьому пристрої.', updatedAt: 'Оновлено',
    level: 'Рівень', input: 'Вхідні', total: 'Усього', lastKnown: 'Показано останній успішний знімок діагностики.',
    emergency: 'Аварійне', threshold: 'Поріг', materialized: 'Матеріалізовано', compaction: 'Стиснення',
    cacheCause: 'Рішення кешу', unknownCause: 'Інше рішення', cacheCategory: 'Кеш', streamCategory: 'Подія потоку',
    historianCategory: 'Історія', dreamerCategory: 'Dreamer', transformCategory: 'Перетворення', progress: 'Прогрес', transformError: 'Виявлено помилку',
  },
  'zh-CN': {
    subtitle: 'OpenCode 上下文', sidebar: '侧边栏', diagnostics: '诊断', refresh: '刷新', refreshing: '正在刷新',
    connected: '已连接', partial: '部分数据', unavailable: '不可用', running: '运行中', idle: '空闲', noSession: '没有活动会话',
    currentSession: '当前会话', context: '上下文', usageUnavailable: '无法读取已保存的上下文用量。',
    liveBreakdownUnavailable: '实时组件需要兼容的本地 Magic Context RPC。', system: '系统',
    conversation: '对话', memories: '记忆', toolCalls: '工具调用', toolDefinitions: '工具定义',
    historian: '历史记录', compartments: '分段', memorySection: '记忆', storedMemories: '已存储记忆',
    statusSection: '状态', queuedOperations: '排队操作', sessionNotes: '会话笔记', dreamer: 'Dreamer',
    liveStatusUnavailable: '模块实时状态需要兼容的本地 Magic Context RPC。', stats: '统计',
    lastInputTokens: '最近输入令牌', cacheTimeline: '缓存时间线', streamLog: '流与插件日志',
    cacheRead: '缓存读取', cacheWrite: '缓存写入', hitRatio: '命中率', cause: '原因',
    noCacheEvents: '此会话没有缓存事件。', noStreamEvents: '没有匹配的日志事件。',
    databaseMissing: '找不到已配置的 Magic Context 或 OpenCode 数据库。',
    schemaPartial: '数据库已打开，但此版本缺少部分预期表。',
    sqliteUnsupported: '此 OpenChamber 运行时不支持 SQLite 诊断。',
    logMissing: '找不到已配置的 Magic Context 日志。',
    readFailure: '无法读取诊断信息。完整刷新成功前会保留现有值。',
    dataSourceNote: '只读快照。私有 Magic Context RPC 可能变化；缓存每 15 秒刷新，打开诊断页时日志事件每 3 秒刷新。',
    remoteNote: '这些文件位于 OpenChamber 服务器上，不一定在此设备上。', updatedAt: '更新时间',
    level: '级别', input: '输入', total: '总计', lastKnown: '正在显示最近一次成功读取的诊断快照。',
    emergency: '紧急', threshold: '阈值', materialized: '已物化', compaction: '压缩',
    cacheCause: '缓存决策', unknownCause: '其他决策', cacheCategory: '缓存', streamCategory: '流事件',
    historianCategory: '历史记录', dreamerCategory: 'Dreamer', transformCategory: '转换', progress: '进度', transformError: '检测到错误',
  },
  'zh-TW': {
    subtitle: 'OpenCode 脈絡', sidebar: '側邊欄', diagnostics: '診斷', refresh: '重新整理', refreshing: '正在重新整理',
    connected: '已連線', partial: '部分資料', unavailable: '無法使用', running: '執行中', idle: '閒置', noSession: '沒有作用中的工作階段',
    currentSession: '目前工作階段', context: '脈絡', usageUnavailable: '無法讀取已儲存的脈絡用量。',
    liveBreakdownUnavailable: '即時組成需要相容的本機 Magic Context RPC。', system: '系統',
    conversation: '對話', memories: '記憶', toolCalls: '工具呼叫', toolDefinitions: '工具定義',
    historian: '歷史記錄', compartments: '分段', memorySection: '記憶', storedMemories: '已儲存記憶',
    statusSection: '狀態', queuedOperations: '排隊中的作業', sessionNotes: '工作階段筆記', dreamer: 'Dreamer',
    liveStatusUnavailable: '模組即時狀態需要相容的本機 Magic Context RPC。', stats: '統計',
    lastInputTokens: '最近輸入權杖', cacheTimeline: '快取時間軸', streamLog: '串流與外掛記錄',
    cacheRead: '快取讀取', cacheWrite: '快取寫入', hitRatio: '命中率', cause: '原因',
    noCacheEvents: '此工作階段沒有快取事件。', noStreamEvents: '沒有符合條件的記錄事件。',
    databaseMissing: '找不到已設定的 Magic Context 或 OpenCode 資料庫。',
    schemaPartial: '資料庫已開啟，但此版本缺少部分預期資料表。',
    sqliteUnsupported: '此 OpenChamber 執行環境不支援 SQLite 診斷。',
    logMissing: '找不到已設定的 Magic Context 記錄。',
    readFailure: '無法讀取診斷資訊。完整重新整理成功前會保留現有值。',
    dataSourceNote: '唯讀快照。私有 Magic Context RPC 可能變更；快取每 15 秒更新，開啟診斷頁時記錄事件每 3 秒更新。',
    remoteNote: '這些檔案位於 OpenChamber 伺服器，不一定在此裝置上。', updatedAt: '更新時間',
    level: '層級', input: '輸入', total: '總計', lastKnown: '目前顯示最近一次成功讀取的診斷快照。',
    emergency: '緊急', threshold: '閾值', materialized: '已具體化', compaction: '壓縮',
    cacheCause: '快取判斷', unknownCause: '其他判斷', cacheCategory: '快取', streamCategory: '串流事件',
    historianCategory: '歷史記錄', dreamerCategory: 'Dreamer', transformCategory: '轉換', progress: '進度', transformError: '偵測到錯誤',
  },
} satisfies Record<Locale, Copy>;

const categoryKeys = {
  cache: 'cacheCategory', stream: 'streamCategory', historian: 'historianCategory',
  dreamer: 'dreamerCategory', transform: 'transformCategory',
} satisfies Record<StreamEvent['category'], CopyKey>;

const causeKeys = {
  emergency: 'emergency', threshold: 'threshold', materialized: 'materialized',
  compaction: 'compaction', cache: 'cacheCause', unknown: 'unknownCause',
} satisfies Record<CacheCause, CopyKey>;

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing Magic Context panel root');

let locale: Locale = 'en';
let activeSessionId: string | null = null;
let activeSessionTitle: string | null = null;
let activeDirectory: string | null = null;
let sessionGeneration = 0;
let snapshot: DiagnosticsResponse | null = null;
let eventPage: EventPageDto | null = null;
let eventCursor: string | null = null;
let initialized = false;
let snapshotInFlight = false;
let eventInFlight = false;
let requestFailed = false;
let eventRequestFailed = false;
let lastSnapshotRefreshAt = 0;
let lastEventRefreshAt = 0;
let pollTimer = 0;
let activeTab: 'sidebar' | 'diagnostics' = 'sidebar';
let contentRoot: HTMLElement | null = null;
let footer: HTMLElement | null = null;
let statusBadge: ReturnType<typeof mountBadge> | null = null;
let refreshButton: ReturnType<typeof mountButton> | null = null;
let tabs: ReturnType<typeof mountTabs> | null = null;

const supportedLocales: Locale[] = ['en', 'es', 'fr', 'de', 'ja', 'ko', 'pl', 'pt-BR', 'tr', 'uk', 'zh-CN', 'zh-TW'];

const localeFor = (localeTag: string): Locale => {
  const normalized = localeTag.replaceAll('_', '-').toLowerCase();
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hant')) return 'zh-TW';
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('pt')) return 'pt-BR';
  const language = normalized.split('-')[0];
  return supportedLocales.find((supported) => supported.toLowerCase() === language) ?? 'en';
};

const t = (key: CopyKey): string => messages[locale][key];

const numberText = (value: number | null | undefined): string => value === null || value === undefined
  ? '—'
  : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const dateText = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
};

const node = (tag: keyof HTMLElementTagNameMap, className = '', text = ''): HTMLElement => {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
};

const appendRow = (parent: HTMLElement, label: string, value: string): void => {
  const row = node('div', 'mc-row');
  row.append(node('span', 'mc-row-label', label), node('span', 'mc-row-value mc-mono', value));
  parent.append(row);
};

const appendSection = (parent: HTMLElement, title: string): HTMLElement => {
  const section = node('section', 'mc-card');
  section.append(node('h2', 'mc-section-title', title));
  parent.append(section);
  return section;
};

const appendProviderStatus = (parent: HTMLElement, provider: ProviderStatus | undefined): void => {
  if (!provider) return;
  const unavailableCapabilities = provider.capabilities
    .filter((capability) => capability.state !== 'available')
    .map((capability) => `${capability.id}=${capability.state}`)
    .slice(0, 4);
  const summary = `${provider.source} · ${provider.state}/${provider.freshness} · ${t('updatedAt')}: ${dateText(provider.observedAt)}`;
  parent.append(node('div', 'mc-muted', unavailableCapabilities.length
    ? `${summary} · ${t('partial')}: ${unavailableCapabilities.join(', ')}`
    : summary));
};

const statusFor = (data: DiagnosticsResponse | null): PanelStatus => {
  if (requestFailed) return { label: t('unavailable'), tone: 'error' };
  if (!data) return { label: t('unavailable'), tone: 'neutral' };
  const states: SourceState[] = [
    data.sources.liveRpc.state,
    data.sources.magicContextDatabase.state,
    data.sources.openCodeDatabase.state,
  ];
  if (states.includes('error')) return { label: t('partial'), tone: 'warning' };
  if (states.some((state) => state === 'ready')) return { label: states.every((state) => state === 'ready') ? t('connected') : t('partial'), tone: states.every((state) => state === 'ready') ? 'success' : 'warning' };
  return { label: t('unavailable'), tone: 'neutral' };
};

const updateHeader = (): void => {
  if (statusBadge) {
    const status = statusFor(snapshot);
    statusBadge.update({ label: status.label, tone: status.tone });
  }
  const inFlight = snapshotInFlight || eventInFlight;
  refreshButton?.update({ label: inFlight ? t('refreshing') : t('refresh'), loading: inFlight });
  tabs?.update({
    activeId: activeTab,
    items: [{ id: 'sidebar', label: t('sidebar') }, { id: 'diagnostics', label: t('diagnostics') }],
  });
};

const sourceMessage = (state: SourceState): string | null => {
  if (state === 'missing') return t('databaseMissing');
  if (state === 'unsupported') return t('sqliteUnsupported');
  if (state === 'partial') return t('schemaPartial');
  if (state === 'error') return t('readFailure');
  if (state === 'unknown') return t('unavailable');
  return null;
};

const displayContext = (container: HTMLElement, data: DiagnosticsResponse | null): void => {
  const database = data?.database;
  const live = data?.liveSidebar;
  const metadata = database?.magicContext;
  const openCode = database?.openCode;
  const durableContext = metadata?.context;
  const usagePercent = live?.usage.usagePercent ?? durableContext?.usagePercent ?? null;
  const inputTokens = live?.usage.inputTokens ?? durableContext?.inputTokens ?? openCode?.lastInputTokens ?? null;
  const contextLimit = live?.usage.contextLimit ?? durableContext?.contextLimit ?? null;
  const usage = appendSection(container, t('context'));
  appendProviderStatus(usage, data?.sources.liveRpc);
  if (activeSessionTitle) usage.append(node('div', 'mc-muted', `${t('currentSession')}: ${activeSessionTitle}`));
  else usage.append(node('div', 'mc-muted', t('noSession')));

  if (usagePercent !== null) {
    const value = Math.max(0, Math.min(100, usagePercent));
    appendRow(usage, t('context'), `${value.toFixed(1)}% · ${numberText(inputTokens)} / ${numberText(contextLimit)}`);
    const progress = node('div', 'mc-progress');
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', t('context'));
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', String(value));
    const fill = node('div', 'mc-progress-fill');
    fill.style.width = `${value}%`;
    progress.append(fill);
    usage.append(progress);
  } else {
    usage.append(node('div', 'mc-muted', t('usageUnavailable')));
  }
  const latest = openCode?.cacheEvents[0];
  appendRow(usage, t('lastInputTokens'), numberText(inputTokens));
  appendRow(usage, t('cacheRead'), numberText(latest?.cacheRead));
  appendRow(usage, t('cacheWrite'), numberText(latest?.cacheWrite));
  const composition = live?.composition;
  appendRow(usage, t('system'), numberText(composition?.systemPromptTokens));
  appendRow(usage, t('conversation'), numberText(composition?.conversationTokens));
  appendRow(usage, t('memories'), numberText(composition?.memoryTokens));
  appendRow(usage, t('toolCalls'), numberText(composition?.toolCallTokens));
  appendRow(usage, t('toolDefinitions'), numberText(composition?.toolDefinitionTokens));
  if (!live || data?.sources.liveRpc.state === 'partial' || data?.sources.liveRpc.state === 'unsupported') {
    usage.append(node('div', 'mc-panel-note', t('liveBreakdownUnavailable')));
  }

  const historian = appendSection(container, t('historian'));
  appendRow(historian, t('compartments'), numberText(live?.counts.compartments ?? metadata?.counts?.compartments));
  appendRow(historian, t('historian'), live?.activity.historianRunning === null || !live
    ? t('unavailable')
    : live.activity.historianRunning ? t('running') : t('idle'));

  const memory = appendSection(container, t('memorySection'));
  appendProviderStatus(memory, data?.sources.magicContextDatabase);
  appendRow(memory, t('storedMemories'), numberText(live?.counts.memories ?? metadata?.counts?.memories));
  appendRow(memory, t('memories'), numberText(live?.counts.memoryBlocks));

  const status = appendSection(container, t('statusSection'));
  appendRow(status, t('queuedOperations'), numberText(live?.counts.pendingOperations ?? metadata?.counts?.pendingOps));
  appendRow(status, t('sessionNotes'), numberText(live?.counts.sessionNotes ?? metadata?.counts?.sessionNotes));

  const dreamer = appendSection(container, t('dreamer'));
  appendRow(dreamer, t('dreamer'), live?.activity.dreamerRunning === null || !live
    ? t('unavailable')
    : live.activity.dreamerRunning ? t('running') : t('idle'));
  appendRow(dreamer, t('updatedAt'), live?.activity.lastDreamerRunAt === null || !live
    ? '—'
    : dateText(new Date(live.activity.lastDreamerRunAt).toISOString()));

  const stats = appendSection(container, t('stats'));
  appendRow(stats, t('lastInputTokens'), numberText(inputTokens));
  appendRow(stats, t('threshold'), live?.cache.thresholdPercent === null || !live
    ? t('unavailable')
    : `${numberText(live.cache.thresholdPercent)}%`);

  const transform = appendSection(container, t('transformCategory'));
  const transformStatus = live?.transform.hasLastError === null || !live
    ? t('unavailable')
    : live.transform.hasLastError ? t('transformError') : live.transform.inProgress ? t('progress') : t('connected');
  appendRow(transform, t('statusSection'), transformStatus);
  const progress = live?.transform.recomp;
  if (progress) {
    appendRow(transform, t('progress'), `${progress.phase} · ${numberText(progress.processedMessages)} / ${numberText(progress.totalMessages)}`);
  }

  const databaseState = data?.sources.magicContextDatabase.state ?? data?.sources.openCodeDatabase.state;
  const message = databaseState && databaseState !== 'ready' ? sourceMessage(databaseState) : null;
  if (message) usage.append(node('div', 'mc-panel-note', message));
  if (data && [data.sources.liveRpc, data.sources.magicContextDatabase, data.sources.openCodeDatabase]
    .some((source) => source.freshness === 'stale')) {
    usage.append(node('div', 'mc-muted', t('lastKnown')));
  }
};

const translatedCategory = (category: StreamEvent['category']): string => {
  return t(categoryKeys[category]);
};

const translatedCause = (cause: CacheCause | null): string => {
  if (!cause) return '—';
  return t(causeKeys[cause]);
};

const renderCacheEvent = (event: CacheEvent): HTMLElement => {
  const card = node('article', 'mc-event');
  const heading = node('div', 'mc-event-head');
  heading.append(node('strong', '', dateText(event.at)), node('span', 'mc-muted', translatedCause(event.cause)));
  const metrics = node('div', 'mc-event-metrics mc-mono');
  metrics.append(
    node('span', '', `${t('input')}: ${numberText(event.inputTokens)}`),
    node('span', '', `${t('cacheRead')}: ${numberText(event.cacheRead)}`),
    node('span', '', `${t('cacheWrite')}: ${numberText(event.cacheWrite)}`),
    node('span', '', `${t('hitRatio')}: ${event.hitRatio === null ? '—' : `${(event.hitRatio * 100).toFixed(1)}%`}`),
  );
  card.append(heading, metrics);
  return card;
};

const renderStreamEvent = (event: StreamEvent): HTMLElement => {
  const card = node('article', 'mc-event');
  const heading = node('div', 'mc-event-head');
  const level = node('span', event.level === 'error' ? 'mc-status-error' : event.level === 'warn' ? 'mc-status-warn' : 'mc-muted', event.level.toUpperCase());
  heading.append(node('strong', '', translatedCategory(event.category)), node('span', 'mc-muted mc-mono', dateText(event.at)), level);
  const metrics = node('div', 'mc-event-metrics mc-mono');
  if (event.inputTokens !== null) metrics.append(node('span', '', `${t('input')}: ${numberText(event.inputTokens)}`));
  if (event.cacheRead !== null) metrics.append(node('span', '', `${t('cacheRead')}: ${numberText(event.cacheRead)}`));
  if (event.cacheWrite !== null) metrics.append(node('span', '', `${t('cacheWrite')}: ${numberText(event.cacheWrite)}`));
  card.append(heading, metrics);
  return card;
};

const displayDiagnostics = (container: HTMLElement, data: DiagnosticsResponse | null): void => {
  const database = data?.database;
  const cacheSection = appendSection(container, t('cacheTimeline'));
  cacheSection.append(node('div', 'mc-muted', t('dataSourceNote')));
  appendProviderStatus(cacheSection, data?.sources.openCodeDatabase);
  const openCode = database?.openCode;
  const cacheState = data?.sources.openCodeDatabase.state ?? 'unknown';
  if (cacheState !== 'ready' && cacheState !== 'partial') {
    cacheSection.append(node('div', 'mc-empty', sourceMessage(cacheState) ?? t('databaseMissing')));
  } else if (!openCode?.cacheEvents.length) {
    cacheSection.append(node('div', 'mc-empty', t('noCacheEvents')));
  } else {
    const list = node('div', 'mc-event-list');
    for (const event of openCode.cacheEvents) list.append(renderCacheEvent(event));
    cacheSection.append(list);
  }

  const logSection = appendSection(container, t('streamLog'));
  const log = eventPage;
  appendProviderStatus(logSection, log?.source ?? data?.sources.logTail);
  const logState = log?.source.state ?? data?.sources.logTail.state ?? 'unknown';
  if (log?.gaps.length) logSection.append(node('div', 'mc-panel-note', `${t('partial')}: ${log.gaps.join(', ')}`));
  if ((!log || !log.events.length) && logState === 'missing') {
    logSection.append(node('div', 'mc-empty', t('logMissing')));
  } else if (!log?.events.length) {
    const emptyMessage = logState === 'ready'
      ? t('noStreamEvents')
      : logState === 'partial'
        ? t('partial')
        : logState === 'error'
          ? t('readFailure')
          : t('unavailable');
    logSection.append(node('div', 'mc-empty', emptyMessage));
  } else {
    if (logState === 'error' || logState === 'missing' || eventRequestFailed) {
      logSection.append(node('div', 'mc-panel-note', t('readFailure')));
      logSection.append(node('div', 'mc-muted', t('lastKnown')));
    }
    const list = node('div', 'mc-event-list');
    for (const event of [...log.events].reverse()) list.append(renderStreamEvent(event));
    logSection.append(list);
  }
  logSection.append(node('div', 'mc-muted', `${t('updatedAt')}: ${dateText(log?.observedAt ?? data?.sources.logTail.observedAt)}`));
};

const renderContent = (): void => {
  if (!contentRoot) return;
  contentRoot.replaceChildren();
  contentRoot.setAttribute('aria-busy', String(snapshotInFlight || eventInFlight));
  if (requestFailed) contentRoot.append(node('div', 'mc-panel-note mc-status-error', t('readFailure')));
  if (activeTab === 'sidebar') displayContext(contentRoot, snapshot);
  else displayDiagnostics(contentRoot, snapshot);
  if (footer) {
    footer.textContent = `${t('dataSourceNote')} ${t('remoteNote')}`;
    contentRoot.append(footer);
  }
  updateHeader();
};

const ageSince = (observedAt: string | null): number | null => {
  if (!observedAt) return null;
  const timestamp = Date.parse(observedAt);
  return Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : null;
};

const staleStatus = (next: ProviderStatus, previous: ProviderStatus): ProviderStatus => ({
  ...next,
  observedAt: previous.observedAt,
  freshness: 'stale' as const,
  ageMs: ageSince(previous.observedAt),
});

const preserveNullValues = <T extends object>(current: T, previous: T): T => {
  const merged = { ...current } as Record<string, unknown>;
  const oldValues = previous as Record<string, unknown>;
  for (const key of Object.keys(merged)) {
    if (merged[key] === null && oldValues[key] !== null && oldValues[key] !== undefined) merged[key] = oldValues[key];
  }
  return merged as T;
};

const hasPreservedValue = (current: object, previous: object): boolean => {
  const fresh = current as Record<string, unknown>;
  const old = previous as Record<string, unknown>;
  return Object.keys(fresh).some((key) => fresh[key] === null && old[key] !== null && old[key] !== undefined);
};

const capabilityIsPartial = (source: ProviderStatus, id: ProviderStatus['capabilities'][number]['id']): boolean =>
  source.capabilities.some((capability) => capability.id === id && capability.state !== 'available');

const mergeSnapshot = (previous: DiagnosticsResponse | null, next: DiagnosticsResponse): DiagnosticsResponse => {
  if (!previous || previous.sessionId !== next.sessionId) return next;
  const merged: DiagnosticsResponse = { ...next, sources: { ...next.sources }, database: { ...next.database } };
  let liveUsedPrevious = false;
  if (!next.liveSidebar && previous.liveSidebar && next.sources.liveRpc.state !== 'ready') {
    merged.liveSidebar = previous.liveSidebar;
    liveUsedPrevious = true;
  } else if (next.liveSidebar && previous.liveSidebar) {
    const current = next.liveSidebar;
    const old = previous.liveSidebar;
    const usage = capabilityIsPartial(next.sources.liveRpc, 'rpc.sidebar-snapshot') ? preserveNullValues(current.usage, old.usage) : current.usage;
    const composition = capabilityIsPartial(next.sources.liveRpc, 'rpc.sidebar-composition') ? preserveNullValues(current.composition, old.composition) : current.composition;
    const counts = capabilityIsPartial(next.sources.liveRpc, 'rpc.sidebar-counts') ? preserveNullValues(current.counts, old.counts) : current.counts;
    const activity = capabilityIsPartial(next.sources.liveRpc, 'rpc.activity-status') ? preserveNullValues(current.activity, old.activity) : current.activity;
    const transform = capabilityIsPartial(next.sources.liveRpc, 'rpc.transform-status')
      ? { ...preserveNullValues(current.transform, old.transform), recomp: current.transform.recomp ?? old.transform.recomp }
      : current.transform;
    const cache = capabilityIsPartial(next.sources.liveRpc, 'rpc.cache-status') ? preserveNullValues(current.cache, old.cache) : current.cache;
    liveUsedPrevious = hasPreservedValue(current.usage, old.usage)
      || hasPreservedValue(current.composition, old.composition)
      || hasPreservedValue(current.counts, old.counts)
      || hasPreservedValue(current.activity, old.activity)
      || hasPreservedValue({ hasLastError: current.transform.hasLastError, inProgress: current.transform.inProgress }, {
        hasLastError: old.transform.hasLastError,
        inProgress: old.transform.inProgress,
      })
      || hasPreservedValue(current.cache, old.cache)
      || (current.transform.recomp === null && old.transform.recomp !== null && capabilityIsPartial(next.sources.liveRpc, 'rpc.transform-status'));
    merged.liveSidebar = { usage, composition, counts, activity, transform, cache } as LiveSidebar;
  }
  if (liveUsedPrevious) merged.sources.liveRpc = staleStatus(next.sources.liveRpc, previous.sources.liveRpc);

  const mcState = next.sources.magicContextDatabase.state;
  const mcFailed = ['error', 'missing', 'unsupported'].includes(mcState);
  const currentMc = next.database.magicContext;
  const previousMc = previous.database.magicContext;
  const counts = mcFailed
    ? previousMc.counts ?? currentMc.counts
    : capabilityIsPartial(next.sources.magicContextDatabase, 'db.session-counts') && currentMc.counts && previousMc.counts
      ? preserveNullValues(currentMc.counts, previousMc.counts)
      : currentMc.counts;
  const context = mcFailed
    ? previousMc.context ?? currentMc.context
    : capabilityIsPartial(next.sources.magicContextDatabase, 'db.session-usage')
      ? currentMc.context ? previousMc.context ? preserveNullValues(currentMc.context, previousMc.context) : currentMc.context : previousMc.context
      : currentMc.context;
  const mcUsedPrevious = (mcFailed && (previousMc.counts !== null || previousMc.context !== null))
    || (currentMc.counts !== null && previousMc.counts !== null && hasPreservedValue(currentMc.counts, previousMc.counts))
    || (currentMc.context !== null && previousMc.context !== null && hasPreservedValue(currentMc.context, previousMc.context))
    || (currentMc.context === null && previousMc.context !== null && !mcFailed);
  if (counts !== currentMc.counts || context !== currentMc.context) {
    merged.database = { ...merged.database, magicContext: { counts, context } };
  }
  if (mcUsedPrevious) merged.sources.magicContextDatabase = staleStatus(next.sources.magicContextDatabase, previous.sources.magicContextDatabase);

  const openCodeState = next.sources.openCodeDatabase.state;
  const openCodeFailed = ['error', 'missing', 'unsupported'].includes(openCodeState);
  const currentOpenCode = next.database.openCode;
  const previousOpenCode = previous.database.openCode;
  const preserveOpenCode = openCodeFailed || (openCodeState === 'partial'
    && currentOpenCode.cacheEvents.length === 0
    && (previousOpenCode.cacheEvents.length > 0 || previousOpenCode.lastInputTokens !== null));
  if (preserveOpenCode) {
    merged.database = { ...merged.database, openCode: previousOpenCode };
    merged.sources.openCodeDatabase = staleStatus(next.sources.openCodeDatabase, previous.sources.openCodeDatabase);
  } else if (openCodeState === 'partial' && previousOpenCode.lastInputTokens !== null && currentOpenCode.lastInputTokens === null) {
    merged.database = { ...merged.database, openCode: { ...currentOpenCode, lastInputTokens: previousOpenCode.lastInputTokens } };
    merged.sources.openCodeDatabase = staleStatus(next.sources.openCodeDatabase, previous.sources.openCodeDatabase);
  }
  return merged;
};

const refreshSnapshot = async (force: boolean): Promise<void> => {
  if (snapshotInFlight || document.visibilityState !== 'visible') return;
  if (!force && Date.now() - lastSnapshotRefreshAt < 15_000) return;
  snapshotInFlight = true;
  updateHeader();
  if (contentRoot) contentRoot.setAttribute('aria-busy', 'true');
  const requestedSession: SessionRefreshStamp = { sessionId: activeSessionId, generation: sessionGeneration };
  const query: DiagnosticsQuery = {};
  if (activeDirectory) query.directory = activeDirectory;
  if (requestedSession.sessionId) query.sessionId = requestedSession.sessionId;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/snapshot', query });
    if (result.status < 200 || result.status >= 300) throw new Error(t('readFailure'));
    const decoded = parseDiagnosticsResponse(result.body);
    if (!decoded) throw new Error(t('readFailure'));
    const currentSession: SessionRefreshStamp = { sessionId: activeSessionId, generation: sessionGeneration };
    if (isCurrentSessionRefresh(requestedSession, currentSession)) {
      snapshot = mergeSnapshot(snapshot, decoded);
      lastSnapshotRefreshAt = Date.now();
      requestFailed = false;
    }
  } catch {
    requestFailed = isCurrentSessionRefresh(requestedSession, { sessionId: activeSessionId, generation: sessionGeneration });
  } finally {
    snapshotInFlight = false;
    renderContent();
    if (!isCurrentSessionRefresh(requestedSession, { sessionId: activeSessionId, generation: sessionGeneration })) {
      void refreshSnapshot(true);
    }
  }
};

const mergeEventPage = (previous: EventPageDto | null, next: EventPageDto): EventPageDto => {
  if (!previous) return next;
  if (next.source.state === 'error' || next.source.state === 'missing' || next.source.state === 'unsupported') {
    const lastGood = preserveLastGoodEvents(previous, { ...next, cursor: previous.cursor });
    return {
      ...lastGood,
      cursor: next.cursor ?? previous.cursor,
      gaps: [...new Set<EventPageDto['gaps'][number]>([...previous.gaps, ...next.gaps, 'source-unavailable'])].slice(-8),
    };
  }
  const byId = new Map(previous.events.map((event) => [event.id, event]));
  for (const event of next.events) byId.set(event.id, event);
  const events = [...byId.values()].slice(-200);
  return {
    ...next,
    events,
    gaps: [...new Set([...previous.gaps, ...next.gaps])].slice(-8),
  };
};

const refreshEvents = async (force: boolean): Promise<void> => {
  if (eventInFlight || document.visibilityState !== 'visible' || activeTab !== 'diagnostics') return;
  if (!force && Date.now() - lastEventRefreshAt < 3_000) return;
  eventInFlight = true;
  updateHeader();
  try {
    const query: Record<string, string> = {};
    if (eventCursor) query.cursor = eventCursor;
    const result = await host.serviceRequest({ method: 'GET', path: '/events', query });
    if (result.status < 200 || result.status >= 300) throw new Error(t('readFailure'));
    const decoded = parseEventPage(result.body);
    if (!decoded) throw new Error(t('readFailure'));
    eventCursor = decoded.cursor;
    eventPage = mergeEventPage(eventPage, decoded);
    lastEventRefreshAt = Date.now();
    eventRequestFailed = false;
  } catch {
    eventRequestFailed = true;
    if (eventPage) {
      eventPage = {
        ...eventPage,
        source: { ...eventPage.source, state: 'error', freshness: 'stale', ageMs: ageSince(eventPage.source.observedAt) },
        gaps: [...new Set<EventPageDto['gaps'][number]>([...eventPage.gaps, 'source-unavailable'])].slice(-8),
      };
    }
  } finally {
    eventInFlight = false;
    renderContent();
  }
};

const refreshAll = async (force: boolean): Promise<void> => {
  await Promise.all([refreshSnapshot(force), ...(activeTab === 'diagnostics' ? [refreshEvents(force)] : [])]);
};

const initialize = (): void => {
  if (initialized) return;
  initialized = true;
  const shell = node('div', 'mc-shell');
  const header = node('header', 'mc-header');
  const brand = node('div', 'mc-brand');
  brand.append(node('h1', 'mc-title', 'Magic Context'), node('div', 'mc-subtitle', t('subtitle')));
  const toolbar = node('div', 'mc-toolbar');
  const badgeRoot = node('div');
  statusBadge = mountBadge(badgeRoot, { label: t('unavailable'), tone: 'neutral' });
  refreshButton = mountButton(toolbar, { label: t('refresh'), size: 'xs', variant: 'ghost', onClick: () => { void refreshAll(true); } });
  toolbar.prepend(badgeRoot);
  header.append(brand, toolbar);
  const tabsRoot = node('div', 'mc-tabs');
  tabs = mountTabs(tabsRoot, {
    items: [{ id: 'sidebar', label: t('sidebar') }, { id: 'diagnostics', label: t('diagnostics') }],
    activeId: activeTab,
    onChange: (value) => {
      activeTab = value === 'diagnostics' ? 'diagnostics' : 'sidebar';
      renderContent();
      if (activeTab === 'diagnostics') void refreshEvents(true);
    },
  });
  contentRoot = node('div', 'mc-content');
  footer = node('div', 'mc-footer');
  shell.append(header, tabsRoot, contentRoot);
  root.replaceChildren(shell);
  renderContent();
  pollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    void refreshSnapshot(false);
    if (activeTab === 'diagnostics') void refreshEvents(false);
  }, 1_000);
};

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  locale = localeFor(context.locale);
  const nextSessionId = context.session?.id ?? null;
  const sessionChanged = nextSessionId !== activeSessionId;
  if (sessionChanged) sessionGeneration++;
  activeSessionId = nextSessionId;
  activeSessionTitle = context.session?.title ?? null;
  const directoryChanged = context.directory !== activeDirectory;
  if (directoryChanged && !sessionChanged) sessionGeneration++;
  activeDirectory = context.directory;
  if (sessionChanged || directoryChanged) snapshot = null;
  if (sessionChanged || directoryChanged) lastSnapshotRefreshAt = 0;
  initialize();
  updateHeader();
  renderContent();
  if (sessionChanged || directoryChanged || !snapshot) void refreshSnapshot(true);
});

host.onDirectory((directory) => {
  if (directory === activeDirectory) return;
  sessionGeneration++;
  activeDirectory = directory;
  snapshot = null;
  lastSnapshotRefreshAt = 0;
  renderContent();
  void refreshSnapshot(true);
});

host.onSession((session) => {
  const nextSessionId = session?.id ?? null;
  if (nextSessionId !== activeSessionId) {
    sessionGeneration++;
    activeSessionId = nextSessionId;
    activeSessionTitle = session?.title ?? null;
    lastSnapshotRefreshAt = 0;
    snapshot = null;
    renderContent();
    void refreshSnapshot(true);
    return;
  }
  activeSessionTitle = session?.title ?? null;
  renderContent();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  void refreshSnapshot(true);
  if (activeTab === 'diagnostics') void refreshEvents(true);
});

window.addEventListener('pagehide', () => {
  window.clearInterval(pollTimer);
  host.dispose();
}, { once: true });
