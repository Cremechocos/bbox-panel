import Foundation
import Security

/// Cookies de session dans le Keychain. Le mot de passe de la Bbox, lui, n'est jamais stocké.
enum Keychain {
    static let service = "fr.bboxpanel.app.session"

    static func save(_ cookies: [String: String], account: String) {
        guard !cookies.isEmpty, let data = try? JSONSerialization.data(withJSONObject: cookies) else {
            delete(account: account)
            return
        }
        let query = baseQuery(account)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            // propre à cet appareil : ni sauvegarde iCloud, ni transfert vers un autre téléphone
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        if SecItemUpdate(query as CFDictionary, attributes as CFDictionary) == errSecItemNotFound {
            SecItemAdd(query.merging(attributes) { $1 } as CFDictionary, nil)
        }
    }

    static func load(account: String) -> [String: String] {
        var query = baseQuery(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data,
              let cookies = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return [:] }
        return cookies
    }

    static func delete(account: String) {
        SecItemDelete(baseQuery(account) as CFDictionary)
    }

    private static func baseQuery(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
}
