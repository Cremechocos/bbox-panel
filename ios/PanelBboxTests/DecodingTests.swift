import XCTest
@testable import PanelBbox

/// Décodage des réponses de la Bbox (§ 4 de docs/API-APPS.md).
final class DecodingTests: XCTestCase {

    // MARK: UTF-8 doublement encodé

    func testFixesDoubleEncodedUTF8() {
        XCTAssertEqual(BboxText.fix("bloquÃ©s"), "bloqués")
        XCTAssertEqual(BboxText.fix("TÃ©lÃ©phone de LÃ©a"), "Téléphone de Léa")
        XCTAssertEqual(BboxText.fix("Ã\u{00A0}l\u{2019}heure"), "Ã\u{00A0}l\u{2019}heure", "un caractère hors Latin-1 empêche la réinterprétation")
        XCTAssertEqual(BboxText.fix("ÅÃ"), "ÅÃ", "sans paire suspecte, rien ne change")
    }

    func testLeavesCorrectTextUntouched() {
        for s in ["bloqués", "Wi-Fi invité", "Décodeur TV", "", "ASCII only", "€ 12", "naïve façade"] {
            XCTAssertEqual(BboxText.fix(s), s)
        }
    }

    func testInvalidSequenceIsKept() {
        // « Ã© » valide suivi d'un octet seul : le décodage UTF-8 échoue, la chaîne reste telle quelle
        let s = "Ã©\u{00C3}"
        XCTAssertEqual(BboxText.fix(s), s)
    }

    func testFixIsAppliedDeeply() throws {
        let data = Data(#"[{"hosts":{"list":[{"hostname":"TÃ©lÃ©","tags":["salle \u00c3\u00a0 manger"]}]}}]"#.utf8)
        let json = try JSON.parse(data).fixingText.unwrapped
        XCTAssertEqual(json["hosts"]["list"][0]["hostname"].string, "Télé")
        XCTAssertEqual(json["hosts"]["list"][0]["tags"][0].string, "salle à manger")
    }

    // MARK: Tableaux à un élément

    func testUnwrapsSingleElementArray() throws {
        let json = try JSON.parse(Data(#"[{"wireless":{"radio":{"24":{"enable":1}}}}]"#.utf8)).unwrapped
        XCTAssertTrue(json["wireless"]["radio"]["24"]["enable"].isOn)
    }

    func testKeepsMultiElementArrays() throws {
        // `hosts` renvoie le réseau principal puis le Wi-Fi invité : on ne déballe pas
        let json = try JSON.parse(Data(#"[{"hosts":{"list":[]}},{"hosts":{"list":[{"id":9}]}}]"#.utf8)).unwrapped
        XCTAssertEqual(json.array.count, 2)
        XCTAssertEqual(json[1]["hosts"]["list"][0]["id"].int, 9)
    }

    func testNumbersAndBooleans() throws {
        let json = try JSON.parse(Data(#"{"a":"12","b":1,"c":true,"d":"-1","e":2.5,"f":null}"#.utf8))
        XCTAssertEqual(json["a"].int, 12)
        XCTAssertTrue(json["b"].isOn)
        XCTAssertEqual(json["c"], .bool(true))
        XCTAssertEqual(json["d"].int, -1)
        XCTAssertEqual(json["e"].double, 2.5)
        XCTAssertTrue(json["f"].isNull)
        XCTAssertTrue(json["absent"]["deeper"].isNull)
        XCTAssertEqual(json["b"].string, "1")
    }

    // MARK: Erreurs `exception`

    func testParsesExceptionWithColonKey() throws {
        let body = try JSON.parse(Data(#"[{"exception":{"domain":"v1/hosts/prioritize","code":"404","errors":[{"name:":"enable","reason":"Object does not exist"}]}}]"#.utf8))
        let ex = try XCTUnwrap(BboxException.from(body))
        XCTAssertEqual(ex.domain, "v1/hosts/prioritize")
        XCTAssertEqual(ex.code, "404")
        XCTAssertEqual(ex.errors.first?.name, "enable")
        XCTAssertTrue(ex.isMissingObject)
        XCTAssertEqual(ex.message, "Fonction absente du firmware de votre Bbox.")
    }

    func testParsesExceptionWithPlainKey() throws {
        let body = try JSON.parse(Data(#"{"exception":{"domain":"v1/dhcp/clients","code":"400","errors":[{"name":"hostname","reason":"Invalid_parameter"}]}}"#.utf8))
        let ex = try XCTUnwrap(BboxException.from(body))
        XCTAssertEqual(ex.errors.first?.name, "hostname")
        XCTAssertFalse(ex.isMissingObject)
        XCTAssertEqual(ex.message, "La Bbox a refusé le champ « hostname » (invalid parameter).")
    }

    func testNoExceptionInRegularBody() throws {
        XCTAssertNil(BboxException.from(try JSON.parse(Data(#"[{"device":{"token":"abc"}}]"#.utf8))))
    }

    func testErrorMapping() throws {
        XCTAssertEqual(PanelError.from(status: 401, body: ["error": "panel_auth_required"], remote: false), .authRequired)
        XCTAssertEqual(PanelError.from(status: 403, body: ["error": "blocked_by_panel"], remote: false), .blockedByPanel)
        XCTAssertEqual(PanelError.from(status: 403, body: ["error": "bbox_remote_forbidden"], remote: false), .remoteForbidden)
        XCTAssertEqual(PanelError.from(status: 403, body: .null, remote: true), .remoteForbidden, "403 de la Bbox jointe à distance")
        XCTAssertEqual(PanelError.from(status: 429, body: ["error": "local_throttle", "retryIn": 8], remote: false), .locked(retryIn: 8))
        let ex = try JSON.parse(Data(#"[{"exception":{"errors":[{"name":"x","reason":"Object does not exist"}]}}]"#.utf8))
        if case .bbox(let e) = PanelError.from(status: 404, body: ex, remote: false) { XCTAssertTrue(e.isMissingObject) } else { XCTFail() }
    }
}

extension JSON: ExpressibleByDictionaryLiteral, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral {
    public init(dictionaryLiteral elements: (String, JSON)...) { self = .object(Dictionary(uniqueKeysWithValues: elements)) }
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
}
