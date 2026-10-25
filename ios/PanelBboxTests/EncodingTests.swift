import XCTest
@testable import PanelBbox

/// Encodage des écritures (§ 3 de docs/API-APPS.md) et utilitaires de connexion.
final class EncodingTests: XCTestCase {

    // MARK: Formulaires

    func testFormMatchesURLSearchParams() {
        // résultats de `new URLSearchParams({...}).toString()` côté relais (server/bbox.mjs → encodeForm)
        let form: BboxForm = ["password": "a b&c=d+é", "remember": 1]
        XCTAssertEqual(form.encoded, "password=a+b%26c%3Dd%2B%C3%A9&remember=1")
    }

    func testBooleansAreOneAndZero() {
        let form: BboxForm = ["radio.enable": true, "wps.enable": false]
        XCTAssertEqual(form.encoded, "radio.enable=1&wps.enable=0")
    }

    func testKeepsUnreservedCharactersAndOrder() {
        let form: BboxForm = ["z": "A-Z_a.z*09", "macaddress": "aa:bb:cc:dd:ee:ff", "a": "~!'()"]
        XCTAssertEqual(form.encoded, "z=A-Z_a.z*09&macaddress=aa%3Abb%3Acc%3Add%3Aee%3Aff&a=%7E%21%27%28%29")
    }

    func testEmptyForm() {
        let form: BboxForm = [:]
        XCTAssertTrue(form.isEmpty)
        XCTAssertEqual(form.encoded, "")
    }

    func testJSONObjectForRelay() {
        let form: BboxForm = ["enable": true, "hostname": "Tele", "id": 3]
        let o = form.jsonObject
        XCTAssertEqual(o["enable"] as? Int, 1)
        XCTAssertEqual(o["hostname"] as? String, "Tele")
        XCTAssertEqual(o["id"] as? Int, 3)
    }

    func testEncodeComponentLikeJavaScript() {
        XCTAssertEqual(HTTP.encodeComponent("a b/c?d=é~*'()!"), "a%20b%2Fc%3Fd%3D%C3%A9~*'()!")
    }

    // MARK: Noms d'appareils

    func testBboxHostnameConversion() {
        XCTAssertEqual(Host.bboxHostname("Télé du salon"), "Tele-du-salon")
        XCTAssertEqual(Host.bboxHostname("  Œuvre & co !! "), "OEuvre-co")
        XCTAssertEqual(Host.bboxHostname("iPhone_de-Léa"), "iPhone_de-Lea")
        XCTAssertEqual(Host.bboxHostname(String(repeating: "a", count: 60)).count, 48)
    }

    // MARK: SSE

    func testSSEParser() {
        var p = SSEParser()
        let lines = ["retry: 3000", "", "event: snapshot", "data: {\"t\":1}", "", ": ping", "", "event: patch", "data: {\"a\":", "data: 2}", ""]
        let events = lines.compactMap { p.feed($0) }
        XCTAssertEqual(events, [SSEEvent(event: "snapshot", data: "{\"t\":1}"), SSEEvent(event: "patch", data: "{\"a\":\n2}")])
    }

    // MARK: Jumelage et adresses

    func testPairingLink() {
        let link = URL(string: "bboxpanel://pair?url=http%3A%2F%2F192.168.1.42%3A8484")!
        XCTAssertEqual(Discovery.pairingOrigin(from: link)?.absoluteString, "http://192.168.1.42:8484")
        XCTAssertNil(Discovery.pairingOrigin(from: URL(string: "bboxpanel://pair?url=javascript%3Aalert(1)")!))
        XCTAssertNil(Discovery.pairingOrigin(from: URL(string: "other://pair?url=http%3A%2F%2F1.2.3.4")!))
    }

    func testRelayOriginFromTypedText() {
        XCTAssertEqual(Discovery.relayOrigin(from: "192.168.1.42")?.absoluteString, "http://192.168.1.42:8484")
        XCTAssertEqual(Discovery.relayOrigin(from: "192.168.1.42:9000")?.absoluteString, "http://192.168.1.42:9000")
        XCTAssertEqual(Discovery.relayOrigin(from: "https://panel.example.fr/app?x=1")?.absoluteString, "https://panel.example.fr")
        XCTAssertNil(Discovery.relayOrigin(from: "ftp://1.2.3.4"))
        XCTAssertNil(Discovery.relayOrigin(from: "  "))
    }

    func testLocalAddresses() {
        XCTAssertTrue(Discovery.isLocal(URL(string: "http://192.168.1.42:8484")!))
        XCTAssertTrue(Discovery.isLocal(URL(string: "http://10.0.0.2")!))
        XCTAssertTrue(Discovery.isLocal(URL(string: "http://nas.local:8484")!))
        XCTAssertTrue(Discovery.isLocal(URL(string: "http://172.20.1.1")!))
        XCTAssertFalse(Discovery.isLocal(URL(string: "https://172.40.1.1")!))
        XCTAssertFalse(Discovery.isLocal(URL(string: "https://panel.example.fr")!))
    }

    func testWifiQRString() {
        XCTAssertEqual(Fmt.wifiQR(ssid: "Ma;Box", passphrase: "p:ss\"", security: "WPA2-PSK"), "WIFI:T:WPA;S:Ma\\;Box;P:p\\:ss\\\";;")
        XCTAssertEqual(Fmt.wifiQR(ssid: "Ouvert", passphrase: nil, security: "None"), "WIFI:T:nopass;S:Ouvert;;")
    }

    // MARK: Cadence

    func testLimiterNeverExceedsThreeConcurrentRequests() async throws {
        let limiter = RequestLimiter(limit: 3)
        let counter = Counter()
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<12 {
                group.addTask {
                    try await limiter.run {
                        await counter.enter()
                        try await Task.sleep(for: .milliseconds(20))
                        await counter.leave()
                    }
                }
            }
            try await group.waitForAll()
        }
        let peak = await counter.peak
        XCTAssertEqual(peak, 3)
    }
}

private actor Counter {
    var current = 0
    var peak = 0
    func enter() { current += 1; peak = max(peak, current) }
    func leave() { current -= 1 }
}
