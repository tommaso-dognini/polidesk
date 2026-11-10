// Clean SRT files and print the result (compared with the JS cleaner in tests).
fn main() {
    for f in std::env::args().skip(1) {
        let segs = polidesk_core::cleaner::parse_srt(&std::fs::read_to_string(&f).unwrap());
        let c = polidesk_core::cleaner::clean_segments(segs);
        print!("{}", polidesk_core::cleaner::write_srt(&c));
        println!("@@{}", polidesk_core::cleaner::paragraphs(&c));
    }
}
