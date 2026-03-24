export const EVENTS = {
    // Client → Server
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    RECONNECT: 'reconnect',
    START_GAME: 'start_game',
    SUBMIT_RANKING: 'submit_ranking',
    SUBMIT_GUESS: 'submit_guess',
    REVEAL_NEXT: 'reveal_next',
    ADVANCE_ROUND: 'advance_round',
    PLAY_AGAIN: 'play_again',
    KICK_PLAYER: 'kick_player',

    // Server → Client
    ROOM_UPDATED: 'room_updated',
    TIMER_SYNC: 'timer_sync',
    ERROR: 'error',
};
