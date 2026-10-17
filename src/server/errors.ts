/** Erreur dont le message est écrit pour être affiché tel quel à l'utilisateur. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}
