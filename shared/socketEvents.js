export const EVENTS = {
    // Client → Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    RECONNECT: 'reconnect',
    REJOIN_AS: 'rejoin_as',
    JOIN_AS_GUESSER: 'join_as_guesser',
    START_GAME: 'start_game',
    UPDATE_SETTINGS: 'update_settings',
    SUBMIT_RANKING: 'submit_ranking',
    SUBMIT_GUESS: 'submit_guess',
    SYNC_GUESS: 'sync_guess',
    REVEAL_NEXT: 'reveal_next',
    ADVANCE_ROUND: 'advance_round',
    PLAY_AGAIN: 'play_again',
    KICK_PLAYER: 'kick_player',
    END_GAME: 'end_game',

    // Server → Client
    ROOM_UPDATED: 'room_updated',
    GUESS_PREVIEW: 'guess_preview',
    TIMER_SYNC: 'timer_sync',
    ERROR: 'error',
};
