import Foundation
import Security

/// Vérification TLS de la Bbox jointe en direct.
///
/// Même jointe par son IP (accès distant, ou 192.168.1.254), la Bbox présente le certificat public de
/// `mabbox.bytel.fr`. On ne désactive jamais la vérification : on évalue la chaîne normalement (autorités
/// du système, dates, révocation) mais contre ce nom-là plutôt que contre l'hôte composé.
final class BboxTLSDelegate: NSObject, URLSessionDelegate {
    static let certificateName = "mabbox.bytel.fr"

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust else {
            return (.performDefaultHandling, nil)
        }
        return Self.evaluate(trust) ? (.useCredential, URLCredential(trust: trust)) : (.cancelAuthenticationChallenge, nil)
    }

    static func evaluate(_ trust: SecTrust) -> Bool {
        let policy = SecPolicyCreateSSL(true, certificateName as CFString)
        guard SecTrustSetPolicies(trust, policy) == errSecSuccess else { return false }
        var error: CFError?
        return SecTrustEvaluateWithError(trust, &error)
    }
}
