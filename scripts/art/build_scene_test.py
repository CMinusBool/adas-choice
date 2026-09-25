"""What build-scene.py promises about a Scene set. Run: python -m unittest scripts/art/build_scene_test.py"""
import importlib.util
import os
import tempfile
import unittest

from PIL import Image

_spec = importlib.util.spec_from_file_location(
    "build_scene", os.path.join(os.path.dirname(__file__), "build-scene.py"))
build_scene = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build_scene)


def _sheet(width, height):
    """A raw sheet whose twelve cells each carry their own flat colour, so a frame can be told apart."""
    image = Image.new("RGB", (width, height))
    cell_w, cell_h = width / 4, height / 3
    for index in range(12):
        x0, y0 = round((index % 4) * cell_w), round((index // 4) * cell_h)
        x1, y1 = round((index % 4 + 1) * cell_w), round((index // 4 + 1) * cell_h)
        image.paste((20 * index, 100, 255 - 20 * index), (x0, y0, x1, y1))
    return image


class BuildSceneTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.mkdtemp()
        self.still = os.path.join(self.directory, "still.png")
        self.sheet = os.path.join(self.directory, "sheet.png")
        self.out = os.path.join(self.directory, "scene")

    def test_writes_the_set_at_the_contract_sizes(self):
        Image.new("RGB", (992, 1586), (40, 60, 90)).save(self.still)
        _sheet(1145, 1374).save(self.sheet)
        build_scene.build(self.still, self.sheet, self.out)
        self.assertEqual(Image.open(self.out + ".webp").size, (360, 576))
        self.assertEqual(Image.open(self.out + "-sprite.webp").size, (1440, 1728))
        gif = Image.open(self.out + ".gif")
        self.assertEqual(gif.size, (360, 576))
        self.assertEqual(gif.n_frames, 12)
        durations = []
        for index in range(12):
            gif.seek(index)
            durations.append(gif.info["duration"])
        self.assertEqual(durations, [600, 250, 250, 300, 300, 350, 400, 500, 300, 250, 250, 350])
        # Frame 6 of the GIF is cell 6 of the sheet (row 2, column 2), not a neighbour's.
        gif.seek(5)
        red, green, blue = gif.convert("RGB").getpixel((180, 288))
        self.assertLess(abs(red - 100), 12)
        self.assertLess(abs(blue - 155), 12)

    def test_refuses_a_still_that_is_not_5_to_8(self):
        Image.new("RGB", (480, 480)).save(self.still)
        _sheet(1145, 1374).save(self.sheet)
        with self.assertRaises(SystemExit):
            build_scene.build(self.still, self.sheet, self.out)

    def test_refuses_a_sheet_whose_cells_are_not_5_to_8(self):
        Image.new("RGB", (992, 1586)).save(self.still)
        _sheet(1920, 1440).save(self.sheet)
        with self.assertRaises(SystemExit):
            build_scene.build(self.still, self.sheet, self.out)


if __name__ == "__main__":
    unittest.main()
