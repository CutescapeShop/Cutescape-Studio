// ==========================================
// Cutescape Studio — Name Keychain Generator
// เวอร์ชันทดลองฐานตามรูปตัวอักษร
// ==========================================


// ---------- ปรับค่าตรงนี้ ----------

name_text = "CUTESCAPE";

// ฟอนต์ที่ลองใช้ได้บน Windows:
// "Arial:style=Bold"
// "Arial Rounded MT Bold"
// "Comic Sans MS:style=Bold"
// "Georgia:style=Bold"
font_name = "Arial:style=Bold";

// ความสูงตัวอักษร
text_size = 18;

// ความหนาฐาน
base_thickness = 3;

// ความหนาตัวอักษรนูน
letter_thickness = 1.2;

// ขอบรอบตัวอักษร
outline_size = 2.2;

// ขนาดรูห่วง
hole_diameter = 4;

// ความหนาเนื้อรอบรู
ring_wall = 2.5;

// ระยะห่างระหว่างห่วงกับชื่อ
ring_gap = 1.2;

// แถบเชื่อมบาง ๆ ด้านหลังตัวอักษร
// ช่วยไม่ให้ตัว I หรือช่องว่างแยกเป็นชิ้น
bridge_height = 3.2;

// แสดงส่วนไหน
// "all"     = ฐานและตัวอักษร
// "base"    = ฐานอย่างเดียว
// "letters" = ตัวอักษรอย่างเดียว
show_part = "all";


// ==========================================
// ค่าที่ระบบคำนวณ
// ==========================================

estimated_text_width =
    len(name_text) * text_size * 0.62;

ring_outer_diameter =
    hole_diameter + (ring_wall * 2);

ring_x =
    -(estimated_text_width / 2)
    - (ring_outer_diameter / 2)
    - ring_gap;


// ==========================================
// รูปตัวอักษร 2D
// ==========================================

module text_2d() {
    text(
        name_text,
        size = text_size,
        font = font_name,
        halign = "center",
        valign = "center",
        spacing = 1
    );
}


// ==========================================
// ขอบตามตัวอักษร
// ==========================================

module outlined_text_2d() {
    offset(r = outline_size)
        text_2d();
}


// ==========================================
// แถบเชื่อมด้านหลัง
// ==========================================

module bridge_2d() {
    translate([
        -estimated_text_width / 2,
        -(text_size * 0.28)
    ])
        square([
            estimated_text_width,
            bridge_height
        ]);
}


// ==========================================
// ห่วงด้านซ้าย
// ==========================================

module ring_2d() {
    translate([ring_x, 0])
        difference() {
            circle(
                d = ring_outer_diameter,
                $fn = 80
            );

            circle(
                d = hole_diameter,
                $fn = 80
            );
        }
}


// ==========================================
// ตัวเชื่อมห่วงกับชื่อ
// ==========================================

module ring_connector_2d() {
    connector_width =
        abs(ring_x)
        - (estimated_text_width / 2)
        + outline_size
        + ring_outer_diameter / 2;

    translate([
        ring_x,
        -bridge_height / 2
    ])
        square([
            connector_width,
            bridge_height
        ]);
}


// ==========================================
// ฐานทั้งหมดแบบ 2D
// ==========================================

module base_shape_2d() {
    union() {
        outlined_text_2d();
        bridge_2d();
        ring_2d();
        ring_connector_2d();
    }
}


// ==========================================
// ฐาน 3D
// ==========================================

module base_3d() {
    color("#ff7eb6")
        linear_extrude(
            height = base_thickness,
            convexity = 10
        )
            base_shape_2d();
}


// ==========================================
// ตัวอักษรนูน 3D
// ==========================================

module letters_3d() {
    color("#ffffff")
        translate([
            0,
            0,
            base_thickness
        ])
            linear_extrude(
                height = letter_thickness,
                convexity = 10
            )
                text_2d();
}


// ==========================================
// แสดงโมเดล
// ==========================================

if (show_part == "base") {
    base_3d();
}

if (show_part == "letters") {
    letters_3d();
}

if (show_part == "all") {
    base_3d();
    letters_3d();
}