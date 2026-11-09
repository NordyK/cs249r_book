# How to run the course

**Recommended:** run `start.bat` (Windows) or `./start.sh` (macOS/Linux). Python 3 is required.
The course opens in your browser at http://127.0.0.1:8765. This gives you:

- progress saved to `progress/progress.json` (you can copy it to another computer),
- a **▶ Run tests** button on exercises that runs the unit tests with one click.

**Without Python:** double-click `index.html`. Everything works, but progress is stored only in the browser,
and you run exercise tests by hand in a terminal (the command is shown on each exercise).

> On Windows, if `python3` does not work, use `python` or `py -3`.

## Programming exercises

Each exercise has a folder `exercises/<name>/` with starter files and tests. Edit the starter files in your editor
and run the tests until they all pass. You may read the tests — they describe what the program must do.

## Updating the course with new chapters

Unzip the new package over the old folder (overwrite files). The `progress/` folder is not in the package, so your progress stays.
