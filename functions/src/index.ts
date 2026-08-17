
// import {setGlobalOptions} from "firebase-functions";
// import {onRequest} from "firebase-functions/https";
// import * as logger from "firebase-functions/logger";

// setGlobalOptions({maxInstances: 10});

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

import * as admin from "firebase-admin";
admin.initializeApp();

export { createRoom } from "./rooms/createRoom";
export { joinRoom } from "./rooms/joinRoom";
export { presenceCleanup } from "./rooms/presenceCleanup";
export { cleanupRooms } from "./rooms/cleanupRooms";
export { cleanupAuthUsers, cleanupAuthUsersTest } from "./auth/cleanupAuthUsers";
export { startGame } from "./game/startGame";
export { endRound } from "./game/endRound";
export { castVote } from "./game/castVote";
export { resolveVote } from "./game/resolveVote";
export { playAgain } from "./game/playAgain";
export { kickPlayer } from "./game/kickPlayer";
export { addLocation } from "./locations/addLocation";
export { updateLocation } from "./locations/updateLocation";
export { toggleLocationActive } from "./locations/toggleLocationActive";
export { deleteLocation } from "./locations/deleteLocation";
export { seedLocations } from "./locations/seedLocations";
export { listAdmins } from "./admins/listAdmins";
export { addAdmin } from "./admins/addAdmin";
export { removeAdmin } from "./admins/removeAdmin";
export { adminRemoved } from "./admins/adminRemoved";
